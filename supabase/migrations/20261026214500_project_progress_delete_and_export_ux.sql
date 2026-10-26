-- Admin-only audited delete for project progress records.
create or replace function private.delete_project_progress(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_before public.project_progress_records;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id=v_uid
      and app_role='admin'::public.app_role
  ) then
    raise exception 'صلاحية Admin مطلوبة لحذف متابعة المشروع';
  end if;

  select *
  into v_before
  from public.project_progress_records
  where id=p_id
  for update;

  if not found then
    raise exception 'سجل المتابعة غير موجود';
  end if;

  delete from public.project_progress_records
  where id=p_id;

  insert into public.audit_log(user_id,action,entity_type,entity_id,details)
  values(
    v_uid,
    'delete',
    'project_progress',
    p_id::text,
    jsonb_build_object('before',to_jsonb(v_before),'reversible',false)
  );

  return jsonb_build_object(
    'ok',true,
    'id',p_id,
    'project',coalesce(v_before.project_name,''),
    'display_number',v_before.display_number
  );
end
$$;

revoke all on function private.delete_project_progress(uuid) from public, anon, authenticated;
grant execute on function private.delete_project_progress(uuid) to authenticated, service_role;

create or replace function public.delete_project_progress(p_id uuid)
returns jsonb
language sql
security invoker
set search_path=''
as $$ select private.delete_project_progress(p_id); $$;

revoke all on function public.delete_project_progress(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_project_progress(uuid) to authenticated, service_role;

notify pgrst,'reload schema';
