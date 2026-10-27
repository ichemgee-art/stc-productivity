-- Retire the data_entry application role from active use.
-- Runtime access model is now Admin (full control) + Viewer (read-only).
-- The enum value remains only for migration compatibility; profiles are constrained to active roles.

update public.profiles
set app_role='viewer'
where app_role='data_entry';

alter table public.profiles
drop constraint if exists profiles_active_roles_only;

alter table public.profiles
add constraint profiles_active_roles_only
check (app_role in ('admin','viewer'));

alter policy "absence_read" on public.attendance_absence_log
using (private.current_app_role() = any (array['admin'::public.app_role,'viewer'::public.app_role]));

alter policy "notes_read" on public.attendance_notes
using (private.current_app_role() = any (array['admin'::public.app_role,'viewer'::public.app_role]));

alter policy "people_read" on public.people
using (private.current_app_role() = any (array['admin'::public.app_role,'viewer'::public.app_role]));

alter policy "Authenticated read aliases" on public.project_aliases
using (private.current_app_role() = any (array['admin'::public.app_role,'viewer'::public.app_role]));

alter policy "Authenticated can read project progress" on public.project_progress_records
using (private.current_app_role() = any (array['admin'::public.app_role,'viewer'::public.app_role]));

alter policy "projects_read" on public.projects
using (private.current_app_role() = any (array['admin'::public.app_role,'viewer'::public.app_role]));

alter policy "sections_read" on public.sections
using (private.current_app_role() = any (array['admin'::public.app_role,'viewer'::public.app_role]));

alter policy "submission_notes_read" on public.submission_notes
using (private.current_app_role() = any (array['admin'::public.app_role,'viewer'::public.app_role]));

alter policy "submission_people_read" on public.submission_people
using (private.current_app_role() = any (array['admin'::public.app_role,'viewer'::public.app_role]));

alter policy "submissions_read" on public.submissions
using (private.current_app_role() = any (array['admin'::public.app_role,'viewer'::public.app_role]));

alter policy "system_state_read" on public.system_state
using (private.current_app_role() = any (array['admin'::public.app_role,'viewer'::public.app_role]));

do $$
declare
  rec record;
  ddl text;
begin
  for rec in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f'
      and n.nspname='private'
      and pg_get_functiondef(p.oid) ilike '%data_entry%'
      and p.proname <> 'enforce_active_cycle_write'
  loop
    ddl := pg_get_functiondef(rec.oid);

    ddl := replace(ddl,'app_role in (''admin'',''data_entry'')','app_role=''admin''');
    ddl := replace(ddl,'app_role in (''admin'', ''data_entry'')','app_role=''admin''');
    ddl := replace(ddl,'app_role in (''admin''::public.app_role,''data_entry''::public.app_role)','app_role=''admin''::public.app_role');
    ddl := replace(ddl,'app_role in (''admin''::public.app_role, ''data_entry''::public.app_role)','app_role=''admin''::public.app_role');
    ddl := replace(ddl,'role not in (''admin'',''data_entry'')','role <> ''admin''');
    ddl := replace(ddl,'role not in (''admin'', ''data_entry'')','role <> ''admin''');
    ddl := replace(ddl,'role not in (''admin''::public.app_role,''data_entry''::public.app_role)','role <> ''admin''::public.app_role');
    ddl := replace(ddl,'v_role not in (''admin''::public.app_role,''data_entry''::public.app_role)','v_role <> ''admin''::public.app_role');
    ddl := replace(ddl,'v_role not in (''admin''::public.app_role, ''data_entry''::public.app_role)','v_role <> ''admin''::public.app_role');
    ddl := replace(ddl,'صلاحية إدخال أو Admin مطلوبة للتعديل','صلاحية Admin مطلوبة للتعديل');
    ddl := replace(ddl,'صلاحية إدخال أو Admin مطلوبة للحذف','صلاحية Admin مطلوبة للحذف');

    execute ddl;
  end loop;
end $$;

create or replace function private.enforce_active_cycle_write()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  return new;
end
$$;
