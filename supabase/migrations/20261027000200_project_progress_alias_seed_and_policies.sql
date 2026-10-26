-- Private idempotency ledger is intentionally inaccessible to API roles.
create policy "No direct request ledger access" on private.project_progress_requests
for all to authenticated using (false) with check (false);
alter policy "Authenticated read aliases" on public.project_aliases
using (private.current_app_role() in ('admin','viewer','data_entry'));
alter policy "Authenticated can read project progress" on public.project_progress_records
using (private.current_app_role() in ('admin','viewer','data_entry'));

-- User explicitly approved this exact alias and the verified canonical spelling.
do $$
declare pid uuid; before_row public.project_progress_records; after_row public.project_progress_records;
begin
  select id into pid from public.projects where normalized_name=lower(btrim(regexp_replace('الكاتدرائية','\s+',' ','g')));
  if pid is null then return; end if;
  insert into public.project_aliases(alias,project_id) values('الكتدرائية - محطة القطار الخفيف',pid)
    on conflict(normalized_name) do nothing;
  if exists(select 1 from public.project_aliases where normalized_name='الكتدرائية - محطة القطار الخفيف' and project_id<>pid) then
    raise exception 'Alias already maps to a different project';
  end if;
  insert into public.audit_log(user_id,action,entity_type,entity_id,details)
    values(null,'create','project_alias',pid::text,jsonb_build_object('source','approved_migration','after',jsonb_build_object('alias','الكتدرائية - محطة القطار الخفيف','project_id',pid)));
  for before_row in select * from public.project_progress_records
    where execution_mode='manual' and lower(btrim(regexp_replace(project_name,'\s+',' ','g')))='الكتدرائية - محطة القطار الخفيف' for update
  loop
    update public.project_progress_records set project_id=pid,execution_mode='linked',manual_executed_quantity=null
      where id=before_row.id returning * into after_row;
    insert into public.audit_log(user_id,action,entity_type,entity_id,details)
      values(null,'update','project_progress',before_row.id::text,jsonb_build_object('source','approved_alias_mapping','before',to_jsonb(before_row),'after',to_jsonb(after_row)));
  end loop;
end $$;
notify pgrst,'reload schema';
