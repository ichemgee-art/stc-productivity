create or replace function public.admin_delete_project(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_project public.projects;
  v_usage bigint := 0;
begin
  if v_uid is null or not exists (
    select 1
    from public.profiles
    where user_id = v_uid
      and app_role = 'admin'
  ) then
    raise exception 'صلاحية Admin مطلوبة';
  end if;

  select *
  into v_project
  from public.projects
  where id = p_id;

  if not found then
    raise exception 'المشروع غير موجود';
  end if;

  select count(*)
  into v_usage
  from public.submissions
  where project_id = p_id;

  if v_usage > 0 then
    return jsonb_build_object(
      'ok', false,
      'blocked', true,
      'reason', 'historical_links',
      'name', v_project.name,
      'submission_links', v_usage
    );
  end if;

  delete from private.project_name_aliases
  where canonical_name = v_project.name;

  delete from public.projects
  where id = p_id;

  insert into public.audit_log(user_id, action, entity_type, entity_id, details)
  values (
    v_uid,
    'delete',
    'project',
    p_id::text,
    jsonb_build_object(
      'name', v_project.name,
      'active', v_project.active
    )
  );

  return jsonb_build_object(
    'ok', true,
    'deleted', true,
    'name', v_project.name
  );
end
$$;

revoke all on function public.admin_delete_project(uuid) from public;
revoke all on function public.admin_delete_project(uuid) from anon;
grant execute on function public.admin_delete_project(uuid) to authenticated;
