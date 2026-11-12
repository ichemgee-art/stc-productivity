create table if not exists public.active_device_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  device_label text not null check (char_length(device_label) between 1 and 160),
  device_kind text not null default 'unknown' check (device_kind in ('desktop','mobile','tablet','unknown')),
  platform text not null default 'Unknown',
  browser text not null default 'Unknown',
  model text,
  current_path text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.active_device_sessions enable row level security;

grant select, insert, update, delete on public.active_device_sessions to authenticated;

drop policy if exists "device_presence_own_select" on public.active_device_sessions;
create policy "device_presence_own_select"
on public.active_device_sessions
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.current_app_role() = 'admin'::public.app_role
);

drop policy if exists "device_presence_own_insert" on public.active_device_sessions;
create policy "device_presence_own_insert"
on public.active_device_sessions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
);

drop policy if exists "device_presence_own_update" on public.active_device_sessions;
create policy "device_presence_own_update"
on public.active_device_sessions
for update
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);

drop policy if exists "device_presence_own_delete" on public.active_device_sessions;
create policy "device_presence_own_delete"
on public.active_device_sessions
for delete
to authenticated
using (
  user_id = (select auth.uid())
);

create index if not exists active_device_sessions_last_seen_idx
on public.active_device_sessions (last_seen_at desc);

create or replace function public.admin_active_devices()
returns table (
  user_id uuid,
  display_name text,
  app_role public.app_role,
  device_id uuid,
  device_label text,
  device_kind text,
  platform text,
  browser text,
  model text,
  current_path text,
  first_seen_at timestamptz,
  last_seen_at timestamptz
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
    d.device_kind,
    d.platform,
    d.browser,
    d.model,
    d.current_path,
    d.first_seen_at,
    d.last_seen_at
  from public.active_device_sessions d
  left join public.profiles p on p.user_id = d.user_id
  where d.last_seen_at >= now() - interval '75 seconds'
  order by d.last_seen_at desc;
end;
$$;

revoke all on function public.admin_active_devices() from public;
revoke all on function public.admin_active_devices() from anon;
grant execute on function public.admin_active_devices() to authenticated;
