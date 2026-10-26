-- Name normalization deliberately matches projects.normalized_name exactly.
create table public.project_aliases (
  alias text not null,
  normalized_name text generated always as (lower(btrim(regexp_replace(alias, '\s+', ' ', 'g')))) stored primary key,
  project_id uuid not null references public.projects(id) on delete restrict,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (btrim(alias) <> '')
);
alter table public.project_aliases enable row level security;
create policy "Authenticated read aliases" on public.project_aliases for select to authenticated using (true);
revoke all on public.project_aliases from public, anon, authenticated;
grant select on public.project_aliases to authenticated;
create index project_aliases_project_idx on public.project_aliases(project_id);

create table private.project_progress_requests (
  user_id uuid not null,
  request_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  primary key(user_id,request_id)
);
alter table private.project_progress_requests enable row level security;
revoke all on private.project_progress_requests from public, anon, authenticated;

alter table public.project_progress_records add column original_project_name text;
update public.project_progress_records set original_project_name=project_name where source='excel_import';
alter table public.project_progress_records drop constraint project_progress_project_required;
alter table public.project_progress_records add constraint project_progress_project_required check (
  (execution_mode='linked' and project_id is not null)
  or (execution_mode='manual' and project_id is null and (
    nullif(btrim(project_name),'') is not null
    or (source='excel_import' and legacy_excel_row is not null)
  ))
);
alter table public.project_progress_records add constraint project_progress_finite check (
  coalesce(contract_quantity,0)::text not in ('NaN','Infinity','-Infinity')
  and historical_before_system::text not in ('NaN','Infinity','-Infinity')
  and coalesce(manual_executed_quantity,0)::text not in ('NaN','Infinity','-Infinity')
);

create or replace function private.guard_project_progress() returns trigger
language plpgsql security invoker set search_path='' as $$
declare k text; v date;
begin
  foreach k in array array['report_date','review_yahya_date','review_marina_date','review_abdelrahman_date'] loop
    v := (to_jsonb(new)->>k)::date;
    if v > public.business_today() then
      if TG_OP='INSERT' then raise exception 'لا يمكن تسجيل تاريخ متابعة أو مراجعة في المستقبل'; end if;
      if (to_jsonb(old)->>k) is distinct from (to_jsonb(new)->>k) then
        raise exception 'لا يمكن تسجيل تاريخ متابعة أو مراجعة في المستقبل';
      end if;
    end if;
  end loop;
  if TG_OP='UPDATE' then
    new.original_project_name := old.original_project_name;
    new.updated_at := greatest(clock_timestamp(),old.updated_at + interval '1 microsecond');
  end if;
  return new;
end $$;
revoke all on function private.guard_project_progress() from public,anon,authenticated;
create trigger guard_project_progress before insert or update on public.project_progress_records
for each row execute function private.guard_project_progress();

-- Preserve the existing field mapping and audited writes behind a non-callable helper.

-- Harden project progress numeric payload handling so blank optional inputs never
-- reach PostgreSQL numeric casts as an empty string.
create or replace function private.write_project_progress(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role public.app_role;
  v_id uuid:=nullif(p_payload->>'id','')::uuid;
  v_before public.project_progress_records;
  v_after public.project_progress_records;
  v_project public.projects;
  v_mode text:=coalesce(nullif(p_payload->>'execution_mode',''),'manual');
  v_project_name text:=nullif(btrim(coalesce(p_payload->>'project_name','')),'');
  v_display_number integer;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select app_role into v_role from public.profiles where user_id=v_uid;
  if v_role is null or v_role not in ('admin'::public.app_role,'data_entry'::public.app_role) then
    raise exception 'غير مسموح لك بإدارة متابعة المشاريع';
  end if;

  if v_mode not in ('linked','manual') then raise exception 'مصدر الكمية المنفذة غير صالح'; end if;

  if nullif(p_payload->>'project_id','') is not null then
    select * into v_project from public.projects where id=(p_payload->>'project_id')::uuid;
    if not found then raise exception 'المشروع المختار غير موجود'; end if;
    v_mode:='linked';
    v_project_name:=coalesce(v_project_name,v_project.name);
  else
    v_mode:='manual';
    if v_project_name is null and not exists(select 1 from public.project_progress_records where id=v_id and source='excel_import' and legacy_excel_row is not null) then raise exception 'اسم المشروع مطلوب'; end if;
  end if;

  if coalesce(nullif(p_payload->>'contract_quantity','')::numeric,0)<0 then
    raise exception 'كميات العقد لا يمكن أن تكون سالبة';
  end if;
  if coalesce(nullif(p_payload->>'historical_before_system','')::numeric,0)<0 then
    raise exception 'كميات ما قبل النظام لا يمكن أن تكون سالبة';
  end if;
  if coalesce(nullif(p_payload->>'manual_executed_quantity','')::numeric,0)<0 then
    raise exception 'الكميات المنفذة لا يمكن أن تكون سالبة';
  end if;

  if v_id is null then
    select coalesce(max(display_number),0)+1 into v_display_number from public.project_progress_records;
    insert into public.project_progress_records(
      report_date,review_yahya_date,review_marina_date,review_abdelrahman_date,display_number,
      project_id,project_name,location,contract_quantity,historical_before_system,
      manual_executed_quantity,execution_mode,financial_status,contract_type,responsible_team,
      notes,source,created_by,updated_by,original_project_name
    ) values (
      coalesce(nullif(p_payload->>'report_date','')::date,public.business_today()),
      nullif(p_payload->>'review_yahya_date','')::date,
      nullif(p_payload->>'review_marina_date','')::date,
      nullif(p_payload->>'review_abdelrahman_date','')::date,
      v_display_number,nullif(p_payload->>'project_id','')::uuid,v_project_name,
      nullif(btrim(coalesce(p_payload->>'location','')),''),
      nullif(p_payload->>'contract_quantity','')::numeric,
      case when v_mode='linked' then coalesce(nullif(p_payload->>'historical_before_system','')::numeric,0) else 0 end,
      case when v_mode='manual' then coalesce(nullif(p_payload->>'manual_executed_quantity','')::numeric,0) else null end,
      v_mode,nullif(btrim(coalesce(p_payload->>'financial_status','')),''),
      nullif(btrim(coalesce(p_payload->>'contract_type','')),''),
      nullif(btrim(coalesce(p_payload->>'responsible_team','')),''),
      nullif(btrim(coalesce(p_payload->>'notes','')),''),
      'app',v_uid,v_uid,case when exists(select 1 from public.project_aliases where normalized_name=lower(btrim(regexp_replace(v_project_name,'\s+',' ','g')))) then v_project_name else null end
    ) returning * into v_after;

    insert into public.audit_log(user_id,action,entity_type,entity_id,details)
    values(v_uid,'create','project_progress',v_after.id::text,jsonb_build_object('after',to_jsonb(v_after)));
    return jsonb_build_object('ok',true,'id',v_after.id,'display_number',v_after.display_number);
  end if;

  select * into v_before from public.project_progress_records where id=v_id for update;
  if not found then raise exception 'سجل المتابعة غير موجود'; end if;

  update public.project_progress_records set
    report_date=coalesce(nullif(p_payload->>'report_date','')::date,report_date),
    review_yahya_date=nullif(p_payload->>'review_yahya_date','')::date,
    review_marina_date=nullif(p_payload->>'review_marina_date','')::date,
    review_abdelrahman_date=nullif(p_payload->>'review_abdelrahman_date','')::date,
    project_id=nullif(p_payload->>'project_id','')::uuid,
    project_name=v_project_name,
    location=nullif(btrim(coalesce(p_payload->>'location','')),''),
    contract_quantity=nullif(p_payload->>'contract_quantity','')::numeric,
    historical_before_system=case when v_mode='linked' then coalesce(nullif(p_payload->>'historical_before_system','')::numeric,0) else 0 end,
    manual_executed_quantity=case when v_mode='manual' then coalesce(nullif(p_payload->>'manual_executed_quantity','')::numeric,0) else null end,
    execution_mode=v_mode,
    financial_status=nullif(btrim(coalesce(p_payload->>'financial_status','')),''),
    contract_type=nullif(btrim(coalesce(p_payload->>'contract_type','')),''),
    responsible_team=nullif(btrim(coalesce(p_payload->>'responsible_team','')),''),
    notes=nullif(btrim(coalesce(p_payload->>'notes','')),''),
    updated_by=v_uid,updated_at=now()
  where id=v_id returning * into v_after;

  insert into public.audit_log(user_id,action,entity_type,entity_id,details)
  values(v_uid,'update','project_progress',v_after.id::text,
         jsonb_build_object('before',to_jsonb(v_before),'after',to_jsonb(v_after)));

  return jsonb_build_object('ok',true,'id',v_after.id,'display_number',v_after.display_number);
end
$$;

notify pgrst,'reload schema';

revoke all on function private.write_project_progress(jsonb) from public,anon,authenticated,service_role;

create or replace function private.save_project_progress(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  role public.app_role;
  rid uuid := nullif(p_payload->>'request_id','')::uuid;
  record_id uuid := nullif(p_payload->>'id','')::uuid;
  before_row public.project_progress_records;
  old_request private.project_progress_requests;
  payload jsonb := p_payload;
  result jsonb;
  mode text := p_payload->>'execution_mode';
  pid uuid := nullif(p_payload->>'project_id','')::uuid;
  alias_name text := nullif(btrim(p_payload->>'alias_name'),'');
  alias_key text;
  alias_pid uuid;
  k text;
  n numeric;
begin
  if uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select app_role into role from public.profiles where user_id=uid;
  if role is null or role not in ('admin','data_entry') then raise exception 'غير مسموح لك بإدارة متابعة المشاريع'; end if;
  if rid is null then raise exception 'مفتاح طلب الحفظ مطلوب، حدّث الصفحة'; end if;
  -- Serializes only retries of the same user's intent, never unrelated records.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || rid::text,0));
  select * into old_request from private.project_progress_requests where user_id=uid and request_id=rid;
  if found then
    if old_request.payload is distinct from p_payload then raise exception 'مفتاح الطلب مستخدم لبيانات مختلفة'; end if;
    if not exists(select 1 from public.project_progress_records where id=(old_request.result->>'id')::uuid) then
      raise exception 'تم حذف سجل المتابعة، حدّث البيانات أولًا';
    end if;
    return old_request.result || jsonb_build_object('duplicate_prevented',true);
  end if;
  if record_id is not null then
    select * into before_row from public.project_progress_records where id=record_id for update;
    if not found then raise exception 'تم حذف سجل المتابعة، حدّث البيانات أولًا'; end if;
    if nullif(payload->>'expected_updated_at','')::timestamptz is distinct from before_row.updated_at then
      raise exception 'السجل اتعدل بواسطة مستخدم آخر، حدّث البيانات أولًا.';
    end if;
  end if;
  if mode is null or mode not in ('linked','manual') then raise exception 'مصدر الكمية المنفذة غير صالح'; end if;
  if mode='linked' and pid is null then raise exception 'المشروع المرتبط مطلوب'; end if;
  if mode='manual' and pid is not null then raise exception 'الإدخال اليدوي لا يقبل مشروعًا مرتبطًا'; end if;
  foreach k in array array['contract_quantity','historical_before_system','manual_executed_quantity'] loop
    n := nullif(btrim(payload->>k),'')::numeric;
    if n < 0 or n::text in ('NaN','Infinity','-Infinity') then raise exception 'الكميات يجب أن تكون أرقامًا غير سالبة ومحدودة'; end if;
    payload := jsonb_set(payload,array[k],coalesce(to_jsonb(n),'null'::jsonb));
  end loop;
  if coalesce((payload->>'save_alias')::boolean,false) then
    if role <> 'admin' then raise exception 'صلاحية Admin مطلوبة لحفظ أسماء المشاريع البديلة'; end if;
    if mode <> 'linked' or alias_name is null then raise exception 'اسم الربط والمشروع مطلوبان'; end if;
    alias_key := lower(btrim(regexp_replace(alias_name,'\s+',' ','g')));
    if exists(select 1 from public.projects where normalized_name=alias_key and id<>pid) then
      raise exception 'الاسم يطابق مشروعًا آخر بالفعل';
    end if;
    insert into public.project_aliases(alias,project_id,created_by) values(alias_name,pid,uid)
      on conflict(normalized_name) do nothing;
    select project_id into alias_pid from public.project_aliases where normalized_name=alias_key;
    if alias_pid <> pid then raise exception 'هذا الاسم مربوط بمشروع آخر، راجع الربط أولًا'; end if;
    insert into public.audit_log(user_id,action,entity_type,entity_id,details)
      values(uid,'create','project_alias',alias_key,jsonb_build_object('after',jsonb_build_object('alias',alias_name,'project_id',pid)));
  end if;
  -- Known aliases apply to new entries only. Explicit linked -> manual edits stay manual.
  if record_id is null and mode='manual' then
    select project_id into alias_pid from public.project_aliases
      where normalized_name=lower(btrim(regexp_replace(payload->>'project_name','\s+',' ','g')));
    if found then
      payload := payload || jsonb_build_object('project_id',alias_pid,'execution_mode','linked','historical_before_system',0);
    end if;
  end if;
  if record_id is null then
    -- Existing display-number convention uses MAX+1; serialize that small allocation.
    perform pg_advisory_xact_lock(hashtextextended('project_progress_display_number',0));
  end if;
  result := private.write_project_progress(payload);
  select result || jsonb_build_object('updated_at',updated_at) into result
    from public.project_progress_records where id=(result->>'id')::uuid;
  insert into private.project_progress_requests values(uid,rid,p_payload,result);
  return result;
end $$;
revoke all on function private.save_project_progress(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.save_project_progress(jsonb) to authenticated,service_role;
notify pgrst,'reload schema';


create or replace view public.v_project_progress
with (security_invoker=true)
as
with prod as (
  select
    s.project_id,
    public.round2(coalesce(sum(s.meters),0)) as productivity_meters
  from public.submissions s
  where s.project_id is not null
  group by s.project_id
)
select
  r.id,
  r.report_date,
  r.review_yahya_date,
  r.review_marina_date,
  r.review_abdelrahman_date,
  r.display_number,
  r.project_id,
  coalesce(nullif(r.original_project_name,''),nullif(r.project_name,''),p.name,'') as project,
  r.project_name as project_name_snapshot,
  r.location,
  r.contract_quantity,
  r.historical_before_system,
  r.manual_executed_quantity,
  r.execution_mode,
  case
    when r.execution_mode='linked'
      then public.round2(r.historical_before_system + coalesce(prod.productivity_meters,0))
    else public.round2(coalesce(r.manual_executed_quantity,0))
  end as executed_quantity,
  coalesce(prod.productivity_meters,0) as productivity_meters,
  case
    when r.contract_quantity is not null and r.contract_quantity > 0 then
      public.round2(
        (
          case
            when r.execution_mode='linked'
              then r.historical_before_system + coalesce(prod.productivity_meters,0)
            else coalesce(r.manual_executed_quantity,0)
          end
        ) / r.contract_quantity * 100
      )
    else null
  end as execution_percent,
  r.financial_status,
  r.contract_type,
  r.responsible_team,
  r.notes,
  r.excel_executed_snapshot,
  r.excel_execution_percent_snapshot,
  r.source,
  r.legacy_excel_row,
  r.created_by,
  r.updated_by,
  r.created_at,
  r.updated_at,
  r.original_project_name
from public.project_progress_records r
left join public.projects p on p.id=r.project_id
left join prod on prod.project_id=r.project_id;

revoke all on public.v_project_progress from anon, authenticated;
grant select on public.v_project_progress to authenticated, service_role;
notify pgrst,'reload schema';
