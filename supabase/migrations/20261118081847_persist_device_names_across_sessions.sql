alter table public.active_device_sessions
add column if not exists device_fingerprint text;

create index if not exists active_device_sessions_user_fingerprint_idx
on public.active_device_sessions (user_id, device_fingerprint)
where device_fingerprint is not null;

create or replace function public.touch_device_presence(
  p_device_id uuid,
  p_device_label text,
  p_device_kind text,
  p_platform text,
  p_browser text,
  p_model text,
  p_current_path text,
  p_device_fingerprint text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_custom_name text;
  v_fingerprint text := nullif(left(btrim(coalesce(p_device_fingerprint, '')), 128), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_fingerprint is not null then
    select d.custom_name
      into v_custom_name
    from public.active_device_sessions d
    where d.user_id = v_user_id
      and d.device_fingerprint = v_fingerprint
      and d.custom_name is not null
    order by d.last_seen_at desc
    limit 1;
  end if;

  insert into public.active_device_sessions (
    user_id,
    device_id,
    device_label,
    custom_name,
    device_kind,
    platform,
    browser,
    model,
    current_path,
    device_fingerprint,
    first_seen_at,
    last_seen_at
  )
  values (
    v_user_id,
    p_device_id,
    left(coalesce(nullif(btrim(p_device_label), ''), 'Unknown Device'), 160),
    v_custom_name,
    case when p_device_kind in ('desktop','mobile','tablet','unknown') then p_device_kind else 'unknown' end,
    left(coalesce(nullif(btrim(p_platform), ''), 'Unknown'), 80),
    left(coalesce(nullif(btrim(p_browser), ''), 'Unknown'), 80),
    nullif(left(btrim(coalesce(p_model, '')), 120), ''),
    left(coalesce(nullif(btrim(p_current_path), ''), '/'), 300),
    v_fingerprint,
    now(),
    now()
  )
  on conflict (user_id, device_id)
  do update set
    device_label = excluded.device_label,
    custom_name = coalesce(public.active_device_sessions.custom_name, v_custom_name),
    device_kind = excluded.device_kind,
    platform = excluded.platform,
    browser = excluded.browser,
    model = excluded.model,
    current_path = excluded.current_path,
    device_fingerprint = coalesce(excluded.device_fingerprint, public.active_device_sessions.device_fingerprint),
    first_seen_at = case
      when public.active_device_sessions.last_seen_at < now() - interval '75 seconds'
        then now()
      else public.active_device_sessions.first_seen_at
    end,
    last_seen_at = now();
end;
$$;

revoke all on function public.touch_device_presence(uuid,text,text,text,text,text,text,text) from public;
revoke all on function public.touch_device_presence(uuid,text,text,text,text,text,text,text) from anon;
grant execute on function public.touch_device_presence(uuid,text,text,text,text,text,text,text) to authenticated;

create or replace function public.mark_device_offline(p_device_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.active_device_sessions
  set last_seen_at = now() - interval '2 minutes'
  where user_id = auth.uid()
    and device_id = p_device_id;
end;
$$;

revoke all on function public.mark_device_offline(uuid) from public;
revoke all on function public.mark_device_offline(uuid) from anon;
grant execute on function public.mark_device_offline(uuid) to authenticated;

create or replace function public.admin_rename_device(
  p_user_id uuid,
  p_device_id uuid,
  p_custom_name text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text := nullif(left(btrim(coalesce(p_custom_name, '')), 80), '');
  v_fingerprint text;
begin
  if private.current_app_role() is distinct from 'admin'::public.app_role then
    raise exception 'Admin access required';
  end if;

  select d.device_fingerprint
    into v_fingerprint
  from public.active_device_sessions d
  where d.user_id = p_user_id
    and d.device_id = p_device_id;

  if v_fingerprint is not null then
    update public.active_device_sessions
    set custom_name = v_name
    where user_id = p_user_id
      and device_fingerprint = v_fingerprint;
  else
    update public.active_device_sessions
    set custom_name = v_name
    where user_id = p_user_id
      and device_id = p_device_id;
  end if;
end;
$$;

revoke all on function public.admin_rename_device(uuid,uuid,text) from public;
revoke all on function public.admin_rename_device(uuid,uuid,text) from anon;
grant execute on function public.admin_rename_device(uuid,uuid,text) to authenticated;
