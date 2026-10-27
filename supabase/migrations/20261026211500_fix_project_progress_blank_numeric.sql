-- Harden project progress numeric payload handling so blank optional inputs never
-- reach PostgreSQL numeric casts as an empty string.
create or replace function private.save_project_progress(p_payload jsonb)
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
    v_project_name:=v_project.name;
  else
    v_mode:='manual';
    if v_project_name is null then raise exception 'اسم المشروع مطلوب'; end if;
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
      notes,source,created_by,updated_by
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
      'app',v_uid,v_uid
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
