-- Add a manually managed lifecycle category to Project Progress.
-- Existing rows intentionally remain NULL until users classify them from Edit.
alter table public.project_progress_records
  add column if not exists project_category text;

alter table public.project_progress_records
  drop constraint if exists project_progress_category_valid;

alter table public.project_progress_records
  add constraint project_progress_category_valid
  check (
    project_category is null
    or project_category in (
      'completed_handed_over',
      'nearing_completion',
      'phased_client_request',
      'active'
    )
  );

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
  v_category text:=nullif(btrim(coalesce(p_payload->>'project_category','')),'');
  v_display_number integer;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select app_role into v_role from public.profiles where user_id=v_uid;
  if v_role is null or v_role not in ('admin'::public.app_role,'data_entry'::public.app_role) then
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
      notes,source,created_by,updated_by,original_project_name,project_category
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
      'app',v_uid,v_uid,
      case when exists(select 1 from public.project_aliases where normalized_name=lower(btrim(regexp_replace(v_project_name,'\s+',' ','g')))) then v_project_name else null end,
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
$$;

revoke all on function private.write_project_progress(jsonb) from public,anon,authenticated,service_role;

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
  r.original_project_name,
  r.project_category
from public.project_progress_records r
left join public.projects p on p.id=r.project_id
left join prod on prod.project_id=r.project_id;

revoke all on public.v_project_progress from anon, authenticated;
grant select on public.v_project_progress to authenticated, service_role;

notify pgrst,'reload schema';
