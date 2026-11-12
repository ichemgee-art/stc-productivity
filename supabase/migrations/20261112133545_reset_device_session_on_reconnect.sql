create or replace function public.touch_device_presence(
  p_device_id uuid,
  p_device_label text,
  p_device_kind text,
  p_platform text,
  p_browser text,
  p_model text,
  p_current_path text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.active_device_sessions (
    user_id,
    device_id,
    device_label,
    device_kind,
    platform,
    browser,
    model,
    current_path,
    first_seen_at,
    last_seen_at
  )
  values (
    v_user_id,
    p_device_id,
    left(coalesce(nullif(btrim(p_device_label), ''), 'Unknown Device'), 160),
    case when p_device_kind in ('desktop','mobile','tablet','unknown') then p_device_kind else 'unknown' end,
    left(coalesce(nullif(btrim(p_platform), ''), 'Unknown'), 80),
    left(coalesce(nullif(btrim(p_browser), ''), 'Unknown'), 80),
    nullif(left(btrim(coalesce(p_model, '')), 120), ''),
    left(coalesce(nullif(btrim(p_current_path), ''), '/'), 300),
    now(),
    now()
  )
  on conflict (user_id, device_id)
  do update set
    device_label = excluded.device_label,
    device_kind = excluded.device_kind,
    platform = excluded.platform,
    browser = excluded.browser,
    model = excluded.model,
    current_path = excluded.current_path,
    first_seen_at = case
      when public.active_device_sessions.last_seen_at < now() - interval '75 seconds'
        then now()
      else public.active_device_sessions.first_seen_at
    end,
    last_seen_at = now();
end;
$$;

revoke all on function public.touch_device_presence(uuid,text,text,text,text,text,text) from public;
revoke all on function public.touch_device_presence(uuid,text,text,text,text,text,text) from anon;
grant execute on function public.touch_device_presence(uuid,text,text,text,text,text,text) to authenticated;
