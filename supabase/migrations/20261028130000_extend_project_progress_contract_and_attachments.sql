-- Project progress contract details + secure attachments — 2026-10-28

alter table public.project_progress_records
  add column original_contract_quantity numeric null
    check (original_contract_quantity is null or original_contract_quantity >= 0),
  add column contract_value numeric null
    check (contract_value is null or contract_value >= 0);

create table public.project_progress_attachments (
  id uuid primary key default gen_random_uuid(),
  project_progress_id uuid not null references public.project_progress_records(id) on delete cascade,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  storage_path text not null unique,
  preview_storage_path text null unique,
  mime_type text not null,
  file_size bigint not null check (file_size >= 0),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.project_progress_attachments enable row level security;

create policy "Authenticated can read project progress attachments"
on public.project_progress_attachments
for select
to authenticated
using (private.current_app_role() in ('admin'::public.app_role, 'viewer'::public.app_role));

create policy "Admin can insert project progress attachments"
on public.project_progress_attachments
for insert
to authenticated
with check (
  private.current_app_role() = 'admin'::public.app_role
  and created_by = auth.uid()
);

create policy "Admin can delete project progress attachments"
on public.project_progress_attachments
for delete
to authenticated
using (private.current_app_role() = 'admin'::public.app_role);

grant select on public.project_progress_attachments to authenticated;
grant insert, delete on public.project_progress_attachments to authenticated;

create or replace function private.enforce_project_progress_attachment_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.project_progress_attachments
    where project_progress_id = new.project_progress_id
  ) >= 3 then
    raise exception 'الحد الأقصى 3 مرفقات لكل متابعة مشروع';
  end if;
  return new;
end;
$$;

create trigger trg_project_progress_attachment_limit
before insert on public.project_progress_attachments
for each row execute function private.enforce_project_progress_attachment_limit();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'project-progress-attachments',
  'project-progress-attachments',
  false,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
);

create policy "Project progress attachments read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-progress-attachments'
  and private.current_app_role() in ('admin'::public.app_role, 'viewer'::public.app_role)
);

create policy "Project progress attachments upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-progress-attachments'
  and private.current_app_role() = 'admin'::public.app_role
);

create policy "Project progress attachments delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-progress-attachments'
  and private.current_app_role() = 'admin'::public.app_role
);

create or replace function private.write_project_progress(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role public.app_role;
  v_id uuid:=nullif(p_payload->>'id','')::uuid;
  v_before public.project_progress_records;
  v_after public.project_progress_records;
  v_project public.projects;
  v_mode text:=coalesce(nullif(p_payload->>'execution_mode',''),'manual');
  v_project_name text:=nullif(btrim(coalesce(p_payload->>'project_name','')),'');
  v_category text:=nullif(btrim(coalesce(p_payload->>'project_category','')),'');
  v_display_number integer;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select app_role into v_role from public.profiles where user_id=v_uid;
  if v_role is null or v_role <> 'admin'::public.app_role then
    raise exception 'غير مسموح لك بإدارة متابعة المشاريع';
  end if;

  if v_mode not in ('linked','manual') then raise exception 'مصدر الكمية المنفذة غير صالح'; end if;

  if v_category is not null and v_category not in (
    'completed_handed_over',
    'nearing_completion',
    'phased_client_request',
    'active'
  ) then
    raise exception 'تصنيف المشروع غير صالح';
  end if;

  if nullif(p_payload->>'project_id','') is not null then
    select * into v_project from public.projects where id=(p_payload->>'project_id')::uuid;
    if not found then raise exception 'المشروع المختار غير موجود'; end if;
    v_mode:='linked';
    v_project_name:=coalesce(v_project_name,v_project.name);
  else
    v_mode:='manual';
    if v_project_name is null and not exists(
      select 1 from public.project_progress_records
      where id=v_id and source='excel_import' and legacy_excel_row is not null
    ) then raise exception 'اسم المشروع مطلوب'; end if;
  end if;

  if coalesce(nullif(p_payload->>'contract_quantity','')::numeric,0)<0 then
    raise exception 'كميات التعاقد لا يمكن أن تكون سالبة';
  end if;
  if coalesce(nullif(p_payload->>'original_contract_quantity','')::numeric,0)<0 then
    raise exception 'كمية التعاقد الأصلية لا يمكن أن تكون سالبة';
  end if;
  if coalesce(nullif(p_payload->>'contract_value','')::numeric,0)<0 then
    raise exception 'قيمة العقد لا يمكن أن تكون سالبة';
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
      project_id,project_name,location,contract_quantity,original_contract_quantity,contract_value,
      historical_before_system,manual_executed_quantity,execution_mode,financial_status,contract_type,
      responsible_team,notes,source,created_by,updated_by,original_project_name,project_category
    ) values (
      coalesce(nullif(p_payload->>'report_date','')::date,public.business_today()),
      nullif(p_payload->>'review_yahya_date','')::date,
      nullif(p_payload->>'review_marina_date','')::date,
      nullif(p_payload->>'review_abdelrahman_date','')::date,
      v_display_number,nullif(p_payload->>'project_id','')::uuid,v_project_name,
      nullif(btrim(coalesce(p_payload->>'location','')),''),
      nullif(p_payload->>'contract_quantity','')::numeric,
      nullif(p_payload->>'original_contract_quantity','')::numeric,
      nullif(p_payload->>'contract_value','')::numeric,
      case when v_mode='linked' then coalesce(nullif(p_payload->>'historical_before_system','')::numeric,0) else 0 end,
      case when v_mode='manual' then coalesce(nullif(p_payload->>'manual_executed_quantity','')::numeric,0) else null end,
      v_mode,nullif(btrim(coalesce(p_payload->>'financial_status','')),''),
      nullif(btrim(coalesce(p_payload->>'contract_type','')),''),
      nullif(btrim(coalesce(p_payload->>'responsible_team','')),''),
      nullif(btrim(coalesce(p_payload->>'notes','')),''),
      'app',v_uid,v_uid,
      case when exists(
        select 1 from public.project_aliases
        where normalized_name=lower(btrim(regexp_replace(v_project_name,'\\s+',' ','g')))
      ) then v_project_name else null end,
      v_category
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
    original_contract_quantity=nullif(p_payload->>'original_contract_quantity','')::numeric,
    contract_value=nullif(p_payload->>'contract_value','')::numeric,
    historical_before_system=case when v_mode='linked' then coalesce(nullif(p_payload->>'historical_before_system','')::numeric,0) else 0 end,
    manual_executed_quantity=case when v_mode='manual' then coalesce(nullif(p_payload->>'manual_executed_quantity','')::numeric,0) else null end,
    execution_mode=v_mode,
    financial_status=nullif(btrim(coalesce(p_payload->>'financial_status','')),''),
    contract_type=nullif(btrim(coalesce(p_payload->>'contract_type','')),''),
    responsible_team=nullif(btrim(coalesce(p_payload->>'responsible_team','')),''),
    notes=nullif(btrim(coalesce(p_payload->>'notes','')),''),
    project_category=coalesce(v_category,project_category),
    updated_by=v_uid,updated_at=now()
  where id=v_id returning * into v_after;

  insert into public.audit_log(user_id,action,entity_type,entity_id,details)
  values(v_uid,'update','project_progress',v_after.id::text,
         jsonb_build_object('before',to_jsonb(v_before),'after',to_jsonb(v_after)));

  return jsonb_build_object('ok',true,'id',v_after.id,'display_number',v_after.display_number);
end
$function$;

create or replace function private.save_project_progress(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
  if role is null or role <> 'admin' then raise exception 'غير مسموح لك بإدارة متابعة المشاريع'; end if;
  if rid is null then raise exception 'مفتاح طلب الحفظ مطلوب، حدّث الصفحة'; end if;

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

  foreach k in array array[
    'contract_quantity',
    'original_contract_quantity',
    'contract_value',
    'historical_before_system',
    'manual_executed_quantity'
  ] loop
    n := nullif(btrim(payload->>k),'')::numeric;
    if n < 0 or n::text in ('NaN','Infinity','-Infinity') then
      raise exception 'القيم الرقمية يجب أن تكون أرقامًا غير سالبة ومحدودة';
    end if;
    payload := jsonb_set(payload,array[k],coalesce(to_jsonb(n),'null'::jsonb));
  end loop;

  if coalesce((payload->>'save_alias')::boolean,false) then
    if role <> 'admin' then raise exception 'صلاحية Admin مطلوبة لحفظ أسماء المشاريع البديلة'; end if;
    if mode <> 'linked' or alias_name is null then raise exception 'اسم الربط والمشروع مطلوبان'; end if;
    alias_key := lower(btrim(regexp_replace(alias_name,'\\s+',' ','g')));
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

  if record_id is null and mode='manual' then
    select project_id into alias_pid from public.project_aliases
      where normalized_name=lower(btrim(regexp_replace(payload->>'project_name','\\s+',' ','g')));
    if found then
      payload := payload || jsonb_build_object('project_id',alias_pid,'execution_mode','linked','historical_before_system',0);
    end if;
  end if;

  if record_id is null then
    perform pg_advisory_xact_lock(hashtextextended('project_progress_display_number',0));
  end if;

  result := private.write_project_progress(payload);
  select result || jsonb_build_object('updated_at',updated_at) into result
    from public.project_progress_records where id=(result->>'id')::uuid;
  insert into private.project_progress_requests values(uid,rid,p_payload,result);
  return result;
end
$function$;

create or replace view public.v_project_progress
with (security_invoker = true)
as
with prod as (
  select s.project_id,
         round2(coalesce(sum(s.meters),0::numeric)) as productivity_meters
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
    when r.execution_mode='linked' then round2(r.historical_before_system + coalesce(prod.productivity_meters,0::numeric))
    else round2(coalesce(r.manual_executed_quantity,0::numeric))
  end as executed_quantity,
  coalesce(prod.productivity_meters,0::numeric) as productivity_meters,
  case
    when r.contract_quantity is not null and r.contract_quantity > 0 then round2((
      case
        when r.execution_mode='linked' then r.historical_before_system + coalesce(prod.productivity_meters,0::numeric)
        else coalesce(r.manual_executed_quantity,0::numeric)
      end / r.contract_quantity
    ) * 100::numeric)
    else null::numeric
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
  r.original_project_name,
  r.project_category,
  r.original_contract_quantity,
  r.contract_value,
  (
    select count(*)::integer
    from public.project_progress_attachments a
    where a.project_progress_id = r.id
  ) as attachment_count
from public.project_progress_records r
left join public.projects p on p.id=r.project_id
left join prod on prod.project_id=r.project_id;
