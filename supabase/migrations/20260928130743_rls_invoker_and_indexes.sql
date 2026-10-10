
-- Make public RPCs use the caller's RLS permissions.
alter function public.create_productivity_submission(date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],text) security invoker;
alter function public.set_active_cycle(text) security invoker;
alter function public.set_review_status(uuid,boolean) security invoker;
alter function public.upsert_absence_type(uuid,date,public.absence_type) security invoker;
alter function public.upsert_attendance_note(uuid,date,text) security invoker;

-- Lock search_path on utility functions flagged by the linter.
alter function public.round2(numeric) set search_path = '';
alter function public.role_ar(public.person_role) set search_path = '';
alter function public.review_status_ar(public.review_status) set search_path = '';
alter function public.absence_type_ar(public.absence_type) set search_path = '';
alter function public.current_cycle_month_key(date) set search_path = '';
alter function public.cycle_bounds(text) set search_path = '';
alter function public.active_cycle_month_key() set search_path = '';
alter function public.previous_cycle_month_key(text) set search_path = '';

-- Remove broad FOR ALL admin policies that also duplicated SELECT policies.
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists people_admin on public.people;
drop policy if exists sections_admin on public.sections;
drop policy if exists projects_admin on public.projects;
drop policy if exists submission_people_admin on public.submission_people;
drop policy if exists absence_admin on public.attendance_absence_log;
drop policy if exists notes_admin on public.attendance_notes;
drop policy if exists system_state_admin on public.system_state;

-- Profiles: read own/admin; only admins manage other profiles.
create policy profiles_admin_insert on public.profiles for insert to authenticated
with check (private.current_app_role()='admin');
create policy profiles_admin_update on public.profiles for update to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');
create policy profiles_admin_delete on public.profiles for delete to authenticated
using (private.current_app_role()='admin');

-- Master/reference data.
create policy people_admin_insert on public.people for insert to authenticated
with check (private.current_app_role()='admin');
create policy people_admin_update on public.people for update to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');
create policy people_admin_delete on public.people for delete to authenticated
using (private.current_app_role()='admin');

create policy sections_admin_insert on public.sections for insert to authenticated
with check (private.current_app_role()='admin');
create policy sections_admin_update on public.sections for update to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');
create policy sections_admin_delete on public.sections for delete to authenticated
using (private.current_app_role()='admin');

-- Data-entry may create/activate projects while submitting. Admins can fully manage.
create policy projects_entry_insert on public.projects for insert to authenticated
with check (private.current_app_role() in ('admin','data_entry'));
create policy projects_entry_update on public.projects for update to authenticated
using (private.current_app_role() in ('admin','data_entry'))
with check (private.current_app_role() in ('admin','data_entry'));
create policy projects_admin_delete on public.projects for delete to authenticated
using (private.current_app_role()='admin');

-- Submissions and participant links.
create policy submissions_entry_insert on public.submissions for insert to authenticated
with check (
  private.current_app_role() in ('admin','data_entry')
  and created_by=(select auth.uid())
);
create policy submission_people_entry_insert on public.submission_people for insert to authenticated
with check (
  private.current_app_role() in ('admin','data_entry')
  and exists (
    select 1 from public.submissions s
    where s.id=submission_id and s.created_by=(select auth.uid())
  )
);
create policy submission_people_admin_update on public.submission_people for update to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');
create policy submission_people_admin_delete on public.submission_people for delete to authenticated
using (private.current_app_role()='admin');

-- Attendance/notes remain admin managed.
create policy absence_admin_insert on public.attendance_absence_log for insert to authenticated
with check (private.current_app_role()='admin');
create policy absence_admin_update on public.attendance_absence_log for update to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');
create policy absence_admin_delete on public.attendance_absence_log for delete to authenticated
using (private.current_app_role()='admin');

create policy notes_admin_insert on public.attendance_notes for insert to authenticated
with check (private.current_app_role()='admin');
create policy notes_admin_update on public.attendance_notes for update to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');
create policy notes_admin_delete on public.attendance_notes for delete to authenticated
using (private.current_app_role()='admin');

create policy system_state_admin_update on public.system_state for update to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');

-- Audit rows may be inserted by operators; only admin reads them.
create policy audit_entry_insert on public.audit_log for insert to authenticated
with check (
  private.current_app_role() in ('admin','data_entry')
  and user_id=(select auth.uid())
);

-- Required table privileges; RLS still decides which rows/actions are allowed.
grant insert, update, delete on public.profiles to authenticated;
grant insert, update, delete on public.people to authenticated;
grant insert, update, delete on public.sections to authenticated;
grant insert, update, delete on public.projects to authenticated;
grant insert, update, delete on public.submissions to authenticated;
grant insert, update, delete on public.submission_people to authenticated;
grant insert, update, delete on public.attendance_absence_log to authenticated;
grant insert, update, delete on public.attendance_notes to authenticated;
grant update on public.system_state to authenticated;
grant insert on public.audit_log to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;

-- Foreign-key covering indexes flagged by the performance advisor.
create index if not exists attendance_absence_updated_by_idx on public.attendance_absence_log(updated_by);
create index if not exists attendance_notes_updated_by_idx on public.attendance_notes(updated_by);
create index if not exists audit_log_user_id_idx on public.audit_log(user_id);
create index if not exists submissions_created_by_idx on public.submissions(created_by);

