drop function if exists public.log_auth_session_event(text);

grant insert (user_id, action, entity_type, entity_id, details)
on public.audit_log
to authenticated;

grant usage
on sequence public.audit_log_id_seq
to authenticated;

drop policy if exists audit_self_auth_session_insert on public.audit_log;

create policy audit_self_auth_session_insert
on public.audit_log
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and entity_type = 'auth_session'
  and entity_id = (select auth.uid())::text
  and action in ('sign_in', 'sign_out')
  and details = '{}'::jsonb
);
