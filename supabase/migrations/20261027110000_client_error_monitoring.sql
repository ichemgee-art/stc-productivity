-- Client-side error monitoring for authenticated application users.
-- Stores only technical diagnostics; no form values, passwords, or request payloads.

create table if not exists public.client_error_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  route text,
  source text not null,
  severity text not null default 'error' check (severity in ('error','warning')),
  message text not null,
  stack text,
  component_stack text,
  release text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.client_error_events enable row level security;

drop policy if exists "Users can insert own client errors" on public.client_error_events;
create policy "Users can insert own client errors"
on public.client_error_events
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Admins can read client errors" on public.client_error_events;
create policy "Admins can read client errors"
on public.client_error_events
for select
to authenticated
using (private.current_app_role() = 'admin');

revoke all on public.client_error_events from public, anon, authenticated;
grant insert, select on public.client_error_events to authenticated;
grant all on public.client_error_events to service_role;

create index if not exists client_error_events_occurred_idx
  on public.client_error_events(occurred_at desc);
create index if not exists client_error_events_user_idx
  on public.client_error_events(user_id, occurred_at desc);
create index if not exists client_error_events_source_idx
  on public.client_error_events(source, occurred_at desc);
