-- Supabase Data API explicit grant hardening.
-- From 2026-10-30, new public tables are not auto-exposed to the Data API.
-- Keep RLS and GRANTs as separate layers: every future CREATE TABLE migration
-- must add only the privileges that table actually needs.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

-- Preserve the current intended Data API contract for existing application tables:
-- anon: no table access
-- authenticated: SELECT only (writes go through controlled RPCs)
-- service_role: full table privileges
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'attendance_absence_log',
    'attendance_notes',
    'audit_log',
    'people',
    'profiles',
    'projects',
    'sections',
    'submission_notes',
    'submission_people',
    'submissions',
    'system_state'
  ]
  loop
    if to_regclass('public.' || quote_ident(v_table)) is not null then
      execute format('revoke all privileges on table public.%I from anon', v_table);
      execute format(
        'revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated',
        v_table
      );
      execute format('grant select on table public.%I to authenticated', v_table);
      execute format('grant all privileges on table public.%I to service_role', v_table);
    end if;
  end loop;
end
$$;
