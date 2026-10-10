
create or replace function public.admin_delete_person(p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_person public.people;
  v_usage bigint := 0;
  v_absence bigint := 0;
  v_notes bigint := 0;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles
    where user_id = v_uid and app_role = 'admin'
  ) then
    raise exception 'صلاحية Admin مطلوبة';
  end if;

  select * into v_person from public.people where id = p_id;
  if not found then raise exception 'الشخص غير موجود'; end if;

  select count(*) into v_usage
  from public.submission_people
  where person_id = p_id;

  select count(*) into v_absence
  from public.attendance_absence_log
  where person_id = p_id;

  select count(*) into v_notes
  from public.attendance_notes
  where person_id = p_id;

  if v_usage > 0 or v_absence > 0 or v_notes > 0 then
    return jsonb_build_object(
      'ok', false,
      'blocked', true,
      'reason', 'historical_links',
      'name', v_person.name,
      'submission_links', v_usage,
      'absence_links', v_absence,
      'note_links', v_notes
    );
  end if;

  delete from public.people where id = p_id;

  insert into public.audit_log(user_id, action, entity_type, entity_id, details)
  values (
    v_uid, 'delete', 'person', p_id::text,
    jsonb_build_object('name', v_person.name, 'role', v_person.role)
  );

  return jsonb_build_object('ok', true, 'deleted', true, 'name', v_person.name);
end
$function$;

create or replace function public.admin_delete_section(p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_section public.sections;
  v_usage bigint := 0;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles
    where user_id = v_uid and app_role = 'admin'
  ) then
    raise exception 'صلاحية Admin مطلوبة';
  end if;

  select * into v_section from public.sections where id = p_id;
  if not found then raise exception 'القطاع غير موجود'; end if;

  select count(*) into v_usage
  from public.submissions
  where section_id = p_id;

  if v_usage > 0 then
    return jsonb_build_object(
      'ok', false,
      'blocked', true,
      'reason', 'historical_links',
      'name', v_section.name,
      'submission_links', v_usage
    );
  end if;

  delete from public.sections where id = p_id;

  insert into public.audit_log(user_id, action, entity_type, entity_id, details)
  values (
    v_uid, 'delete', 'section', p_id::text,
    jsonb_build_object('name', v_section.name, 'price_per_meter', v_section.price_per_meter)
  );

  return jsonb_build_object('ok', true, 'deleted', true, 'name', v_section.name);
end
$function$;

revoke all on function public.admin_delete_person(uuid) from public, anon;
revoke all on function public.admin_delete_section(uuid) from public, anon;
grant execute on function public.admin_delete_person(uuid) to authenticated;
grant execute on function public.admin_delete_section(uuid) to authenticated;

