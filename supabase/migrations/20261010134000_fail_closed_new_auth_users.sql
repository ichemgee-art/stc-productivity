-- Fail closed for new Auth users. Authentication alone must not grant application access.
-- Existing profiles are preserved; only explicitly provisioned profiles can read operational data.

drop trigger if exists on_auth_user_created_ichem on auth.users;
drop trigger if exists on_auth_user_created_ichem_profile on auth.users;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Deliberately do not create a public.profiles row automatically.
  -- A new Auth user has no app_role, so private.current_app_role() returns NULL
  -- and all operational RLS policies deny access.
  return new;
end
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created_ichem_profile
after insert on auth.users
for each row execute function private.handle_new_auth_user();
