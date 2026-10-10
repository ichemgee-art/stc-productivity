
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path=''
as $$
  select p.app_role from public.profiles p where p.user_id=auth.uid()
$$;
revoke all on function private.current_app_role() from public, anon;
grant execute on function private.current_app_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.sections enable row level security;
alter table public.projects enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_people enable row level security;
alter table public.attendance_absence_log enable row level security;
alter table public.attendance_notes enable row level security;
alter table public.system_state enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (user_id=(select auth.uid()) or private.current_app_role()='admin');

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');

drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated
using (private.current_app_role() in ('admin','viewer','data_entry'));

drop policy if exists people_admin on public.people;
create policy people_admin on public.people for all to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');

drop policy if exists sections_read on public.sections;
create policy sections_read on public.sections for select to authenticated
using (private.current_app_role() in ('admin','viewer','data_entry'));

drop policy if exists sections_admin on public.sections;
create policy sections_admin on public.sections for all to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated
using (private.current_app_role() in ('admin','viewer','data_entry'));

drop policy if exists projects_admin on public.projects;
create policy projects_admin on public.projects for all to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');

drop policy if exists submissions_read on public.submissions;
create policy submissions_read on public.submissions for select to authenticated
using (private.current_app_role() in ('admin','viewer','data_entry'));

drop policy if exists submissions_admin on public.submissions;
create policy submissions_admin on public.submissions for update to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');

drop policy if exists submissions_admin_delete on public.submissions;
create policy submissions_admin_delete on public.submissions for delete to authenticated
using (private.current_app_role()='admin');

drop policy if exists submission_people_read on public.submission_people;
create policy submission_people_read on public.submission_people for select to authenticated
using (private.current_app_role() in ('admin','viewer','data_entry'));

drop policy if exists submission_people_admin on public.submission_people;
create policy submission_people_admin on public.submission_people for all to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');

drop policy if exists absence_read on public.attendance_absence_log;
create policy absence_read on public.attendance_absence_log for select to authenticated
using (private.current_app_role() in ('admin','viewer','data_entry'));

drop policy if exists absence_admin on public.attendance_absence_log;
create policy absence_admin on public.attendance_absence_log for all to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');

drop policy if exists notes_read on public.attendance_notes;
create policy notes_read on public.attendance_notes for select to authenticated
using (private.current_app_role() in ('admin','viewer','data_entry'));

drop policy if exists notes_admin on public.attendance_notes;
create policy notes_admin on public.attendance_notes for all to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');

drop policy if exists system_state_read on public.system_state;
create policy system_state_read on public.system_state for select to authenticated
using (private.current_app_role() in ('admin','viewer','data_entry'));

drop policy if exists system_state_admin on public.system_state;
create policy system_state_admin on public.system_state for all to authenticated
using (private.current_app_role()='admin')
with check (private.current_app_role()='admin');

drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated
using (private.current_app_role()='admin');

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

grant select on public.people,public.sections,public.projects,public.submissions,
 public.submission_people,public.attendance_absence_log,public.attendance_notes,
 public.system_state,public.v_master_data,public.v_master_data_ar,
 public.v_person_operations,public.v_project_autocomplete
to authenticated;
grant select on public.profiles to authenticated;
grant select on public.audit_log to authenticated;

grant execute on function public.create_productivity_submission(date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],text) to authenticated;
grant execute on function public.set_active_cycle(text) to authenticated;
grant execute on function public.set_review_status(uuid,boolean) to authenticated;
grant execute on function public.upsert_absence_type(uuid,date,public.absence_type) to authenticated;
grant execute on function public.upsert_attendance_note(uuid,date,text) to authenticated;
grant execute on function public.attendance_for_cycle(text) to authenticated;
grant execute on function public.person_cycle_stats(text,public.person_role) to authenticated;
grant execute on function public.cycle_summary(text) to authenticated;
grant execute on function public.dashboard_data(text) to authenticated;
grant execute on function public.cycle_bounds(text) to authenticated;
grant execute on function public.current_cycle_month_key(date) to authenticated;
grant execute on function public.active_cycle_month_key() to authenticated;
grant execute on function public.previous_cycle_month_key(text) to authenticated;

