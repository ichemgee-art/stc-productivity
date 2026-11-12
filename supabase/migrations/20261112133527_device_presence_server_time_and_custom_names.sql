alter table public.active_device_sessions
add column if not exists custom_name text;

alter table public.active_device_sessions
drop constraint if exists active_device_sessions_custom_name_length;

alter table public.active_device_sessions
add constraint active_device_sessions_custom_name_length
check (custom_name is null or char_length(btrim(custom_name)) between 1 and 80);

drop policy if exists "device_presence_own_update" on public.active_device_sessions;
create policy "device_presence_own_update"
on public.active_device_sessions
for update
to authenticated
using (
  user_id = (select auth.uid())
  or private.current_app_role() = 'admin'::public.app_role
)
with check (
  user_id = (select auth.uid())
  or private.current_app_role() = 'admin'::public.app_role
);

drop function if exists public.admin_active_devices();

create function public.admin_active_devices()
returns table (
  user_id uuid,
  display_name text,
  app_role public.app_role,
  device_id uuid,
  device_label text,
  custom_name text,
  device_kind text,
  platform text,
  browser text,
  model text,
  current_path text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  last_seen_seconds integer,
  session_seconds integer
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
    d.user_id,
    coalesce(p.display_name, 'مستخدم')::text,
    p.app_role,
    d.device_id,
    d.device_label,
    d.custom_name,
    d.device_kind,
    d.platform,
    d.browser,
    d.model,
    d.current_path,
    d.first_seen_at,
    d.last_seen_at,
    greatest(0, floor(extract(epoch from (now() - d.last_seen_at))))::integer,
    greatest(0, floor(extract(epoch from (now() - d.first_seen_at))))::integer
  from public.active_device_sessions d
  left join public.profiles p on p.user_id = d.user_id
  where d.last_seen_at >= now() - interval '75 seconds'
  order by d.last_seen_at desc;
end;
$$;

revoke all on function public.admin_active_devices() from public;
revoke all on function public.admin_active_devices() from anon;
grant execute on function public.admin_active_devices() to authenticated;
