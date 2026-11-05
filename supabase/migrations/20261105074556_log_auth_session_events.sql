create or replace function public.log_auth_session_event(p_action text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_audit_id bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_action not in ('sign_in', 'sign_out') then
    raise exception 'Unsupported auth session action';
  end if;

  insert into public.audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    v_user_id,
    p_action,
    'auth_session',
    v_user_id::text,
    jsonb_build_object(
      'session_id', coalesce(auth.jwt() ->> 'session_id', ''),
      'event', p_action
    )
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke all on function public.log_auth_session_event(text) from public;
revoke all on function public.log_auth_session_event(text) from anon;
grant execute on function public.log_auth_session_event(text) to authenticated;
