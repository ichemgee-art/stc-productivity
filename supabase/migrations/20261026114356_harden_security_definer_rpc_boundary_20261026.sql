-- Harden privileged RPCs by keeping SECURITY DEFINER implementations out of the
-- exposed public schema and exposing SECURITY INVOKER wrappers instead.
-- Preserve existing API signatures and role grants.

grant usage on schema private to authenticated, service_role;
revoke usage on schema private from anon;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

alter function public.admin_delete_person(uuid) set schema private;
alter function public.admin_delete_project(uuid) set schema private;
alter function public.admin_delete_section(uuid) set schema private;
alter function public.admin_restore_audit_event(bigint) set schema private;
alter function public.admin_save_person(uuid,text,public.person_role,boolean) set schema private;
alter function public.admin_save_project(uuid,text,boolean) set schema private;
alter function public.admin_save_section(uuid,text,numeric,boolean) set schema private;
alter function public.create_productivity_submission(date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],text) set schema private;
alter function public.create_productivity_submission(date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],text,uuid) set schema private;
alter function public.delete_productivity_submission(uuid) set schema private;
alter function public.set_active_cycle(text) set schema private;
alter function public.set_review_status(uuid,boolean) set schema private;
alter function public.update_productivity_submission(uuid,date,text,text,numeric,uuid[],uuid[],uuid[],uuid[]) set schema private;
alter function public.update_productivity_submission(uuid,date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],timestamp with time zone) set schema private;
alter function public.upsert_absence_type(uuid,date,public.absence_type) set schema private;
alter function public.upsert_attendance_note(uuid,date,text) set schema private;
alter function public.upsert_submission_note(uuid,text) set schema private;

create function public.admin_delete_person(p_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.admin_delete_person(p_id); $$;

create function public.admin_delete_project(p_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.admin_delete_project(p_id); $$;

create function public.admin_delete_section(p_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.admin_delete_section(p_id); $$;

create function public.admin_restore_audit_event(p_audit_id bigint)
returns jsonb language sql security invoker set search_path=''
as $$ select private.admin_restore_audit_event(p_audit_id); $$;

create function public.admin_save_person(
  p_id uuid, p_name text, p_role public.person_role, p_active boolean default true
)
returns uuid language sql security invoker set search_path=''
as $$ select private.admin_save_person(p_id,p_name,p_role,p_active); $$;

create function public.admin_save_project(
  p_id uuid, p_name text, p_active boolean default true
)
returns uuid language sql security invoker set search_path=''
as $$ select private.admin_save_project(p_id,p_name,p_active); $$;

create function public.admin_save_section(
  p_id uuid, p_name text, p_price numeric, p_active boolean default true
)
returns uuid language sql security invoker set search_path=''
as $$ select private.admin_save_section(p_id,p_name,p_price,p_active); $$;

create function public.create_productivity_submission(
  p_work_date date,
  p_project_name text,
  p_section_name text,
  p_meters numeric,
  p_engineer_ids uuid[] default '{}'::uuid[],
  p_technician_ids uuid[] default '{}'::uuid[],
  p_assistant_ids uuid[] default '{}'::uuid[],
  p_worker_ids uuid[] default '{}'::uuid[],
  p_source text default 'web'::text
)
returns jsonb language sql security invoker set search_path=''
as $$
  select private.create_productivity_submission(
    p_work_date,p_project_name,p_section_name,p_meters,
    p_engineer_ids,p_technician_ids,p_assistant_ids,p_worker_ids,p_source
  );
$$;

create function public.create_productivity_submission(
  p_work_date date,
  p_project_name text,
  p_section_name text,
  p_meters numeric,
  p_engineer_ids uuid[],
  p_technician_ids uuid[],
  p_assistant_ids uuid[],
  p_worker_ids uuid[],
  p_source text,
  p_client_request_id uuid
)
returns jsonb language sql security invoker set search_path=''
as $$
  select private.create_productivity_submission(
    p_work_date,p_project_name,p_section_name,p_meters,
    p_engineer_ids,p_technician_ids,p_assistant_ids,p_worker_ids,p_source,p_client_request_id
  );
$$;

create function public.delete_productivity_submission(p_submission_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.delete_productivity_submission(p_submission_id); $$;

create function public.set_active_cycle(p_month_key text)
returns table(month_key text, cycle_start date, cycle_end date)
language sql security invoker set search_path=''
as $$ select * from private.set_active_cycle(p_month_key); $$;

create function public.set_review_status(p_submission_id uuid, p_reviewed boolean)
returns public.review_status language sql security invoker set search_path=''
as $$ select private.set_review_status(p_submission_id,p_reviewed); $$;

create function public.update_productivity_submission(
  p_submission_id uuid,
  p_work_date date,
  p_project_name text,
  p_section_name text,
  p_meters numeric,
  p_engineer_ids uuid[] default '{}'::uuid[],
  p_technician_ids uuid[] default '{}'::uuid[],
  p_assistant_ids uuid[] default '{}'::uuid[],
  p_worker_ids uuid[] default '{}'::uuid[]
)
returns jsonb language sql security invoker set search_path=''
as $$
  select private.update_productivity_submission(
    p_submission_id,p_work_date,p_project_name,p_section_name,p_meters,
    p_engineer_ids,p_technician_ids,p_assistant_ids,p_worker_ids
  );
$$;

create function public.update_productivity_submission(
  p_submission_id uuid,
  p_work_date date,
  p_project_name text,
  p_section_name text,
  p_meters numeric,
  p_engineer_ids uuid[],
  p_technician_ids uuid[],
  p_assistant_ids uuid[],
  p_worker_ids uuid[],
  p_expected_updated_at timestamp with time zone
)
returns jsonb language sql security invoker set search_path=''
as $$
  select private.update_productivity_submission(
    p_submission_id,p_work_date,p_project_name,p_section_name,p_meters,
    p_engineer_ids,p_technician_ids,p_assistant_ids,p_worker_ids,p_expected_updated_at
  );
$$;

create function public.upsert_absence_type(
  p_person_id uuid, p_date date, p_type public.absence_type
)
returns void language sql security invoker set search_path=''
as $$ select private.upsert_absence_type(p_person_id,p_date,p_type); $$;

create function public.upsert_attendance_note(
  p_person_id uuid, p_date date, p_note text
)
returns void language sql security invoker set search_path=''
as $$ select private.upsert_attendance_note(p_person_id,p_date,p_note); $$;

create function public.upsert_submission_note(
  p_submission_id uuid, p_note text
)
returns jsonb language sql security invoker set search_path=''
as $$ select private.upsert_submission_note(p_submission_id,p_note); $$;

revoke all on function public.admin_delete_person(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_delete_project(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_delete_section(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_restore_audit_event(bigint) from public, anon, authenticated, service_role;
revoke all on function public.admin_save_person(uuid,text,public.person_role,boolean) from public, anon, authenticated, service_role;
revoke all on function public.admin_save_project(uuid,text,boolean) from public, anon, authenticated, service_role;
revoke all on function public.admin_save_section(uuid,text,numeric,boolean) from public, anon, authenticated, service_role;
revoke all on function public.create_productivity_submission(date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],text) from public, anon, authenticated, service_role;
revoke all on function public.create_productivity_submission(date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],text,uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_productivity_submission(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_active_cycle(text) from public, anon, authenticated, service_role;
revoke all on function public.set_review_status(uuid,boolean) from public, anon, authenticated, service_role;
revoke all on function public.update_productivity_submission(uuid,date,text,text,numeric,uuid[],uuid[],uuid[],uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.update_productivity_submission(uuid,date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function public.upsert_absence_type(uuid,date,public.absence_type) from public, anon, authenticated, service_role;
revoke all on function public.upsert_attendance_note(uuid,date,text) from public, anon, authenticated, service_role;
revoke all on function public.upsert_submission_note(uuid,text) from public, anon, authenticated, service_role;

grant execute on function public.admin_delete_person(uuid) to authenticated, service_role;
grant execute on function public.admin_delete_project(uuid) to authenticated, service_role;
grant execute on function public.admin_delete_section(uuid) to authenticated, service_role;
grant execute on function public.admin_restore_audit_event(bigint) to authenticated, service_role;
grant execute on function public.admin_save_person(uuid,text,public.person_role,boolean) to authenticated, service_role;
grant execute on function public.admin_save_project(uuid,text,boolean) to authenticated, service_role;
grant execute on function public.admin_save_section(uuid,text,numeric,boolean) to authenticated, service_role;
grant execute on function public.create_productivity_submission(date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],text,uuid) to authenticated, service_role;
grant execute on function public.delete_productivity_submission(uuid) to authenticated, service_role;
grant execute on function public.set_active_cycle(text) to authenticated, service_role;
grant execute on function public.set_review_status(uuid,boolean) to authenticated, service_role;
grant execute on function public.update_productivity_submission(uuid,date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],timestamp with time zone) to authenticated, service_role;
grant execute on function public.upsert_absence_type(uuid,date,public.absence_type) to authenticated, service_role;
grant execute on function public.upsert_attendance_note(uuid,date,text) to authenticated, service_role;
grant execute on function public.upsert_submission_note(uuid,text) to authenticated, service_role;

grant execute on function public.create_productivity_submission(date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],text) to service_role;
grant execute on function public.update_productivity_submission(uuid,date,text,text,numeric,uuid[],uuid[],uuid[],uuid[]) to service_role;

notify pgrst, 'reload schema';
