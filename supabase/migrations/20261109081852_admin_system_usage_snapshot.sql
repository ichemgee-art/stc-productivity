create or replace function public.admin_system_usage_snapshot()
returns table (
  database_bytes bigint,
  storage_bytes bigint,
  file_count bigint,
  app_users bigint,
  submissions bigint,
  submission_people bigint,
  people bigint,
  projects bigint,
  sections bigint,
  project_progress bigint,
  project_progress_attachments bigint,
  audit_events bigint,
  attendance_absence_rows bigint,
  attendance_notes bigint,
  client_error_events bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if private.current_app_role() is distinct from 'admin'::public.app_role then
    raise exception 'Admin access required';
  end if;

  return query
  select
    pg_database_size(current_database())::bigint,
    coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o), 0)::bigint,
    (select count(*) from storage.objects)::bigint,
    (select count(*) from public.profiles)::bigint,
    (select count(*) from public.submissions)::bigint,
    (select count(*) from public.submission_people)::bigint,
    (select count(*) from public.people)::bigint,
    (select count(*) from public.projects)::bigint,
    (select count(*) from public.sections)::bigint,
    (select count(*) from public.project_progress_records)::bigint,
    (select count(*) from public.project_progress_attachments)::bigint,
    (select count(*) from public.audit_log)::bigint,
    (select count(*) from public.attendance_absence_log)::bigint,
    (select count(*) from public.attendance_notes)::bigint,
    (select count(*) from public.client_error_events)::bigint;
end;
$$;

revoke all on function public.admin_system_usage_snapshot() from public;
revoke all on function public.admin_system_usage_snapshot() from anon;
grant execute on function public.admin_system_usage_snapshot() to authenticated;
