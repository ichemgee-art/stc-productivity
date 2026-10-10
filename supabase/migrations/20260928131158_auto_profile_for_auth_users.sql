
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.profiles(user_id,display_name,app_role)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name',new.email,'مستخدم'),
    'viewer'
  )
  on conflict(user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_ichem on auth.users;
create trigger on_auth_user_created_ichem
after insert on auth.users
for each row execute function private.handle_new_auth_user();

revoke all on function private.handle_new_auth_user() from public,anon,authenticated;

