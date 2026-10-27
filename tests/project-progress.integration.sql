-- Execute through an administrative SQL connection. All fixtures and audit events roll back.
begin;
do $$
declare
  admin_id uuid; entry_id uuid; viewer_id uuid;
  a uuid; b uuid; r jsonb; retried jsonb; p jsonb; stale jsonb; row_data public.v_project_progress;
  legacy public.project_progress_records; failed boolean; qty numeric; audit_count integer;
  alias_name text; alias_project_id uuid; active_section text; submission_result jsonb;
begin
  select user_id into admin_id from public.profiles where app_role='admin' limit 1;
  select user_id into entry_id from public.profiles where app_role='data_entry' limit 1;
  select user_id into viewer_id from public.profiles where app_role='viewer' limit 1;
  assert admin_id is not null, 'admin fixture required';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  insert into public.projects(name,active)
    values('__progress_test_a_'||gen_random_uuid(),true)
    returning id into a;
  insert into public.projects(name,active)
    values('__progress_test_b_'||gen_random_uuid(),true)
    returning id into b;
  p := jsonb_build_object('request_id',gen_random_uuid(),'execution_mode','linked','project_id',a,'project_name','test','contract_quantity','  ','historical_before_system',' ','manual_executed_quantity','');
  r := public.save_project_progress(p);
  select * into row_data from public.v_project_progress where id=(r->>'id')::uuid;
  assert row_data.contract_quantity is null and row_data.execution_percent is null, 'linked without contract / blank numeric';
  retried := public.save_project_progress(p);
  assert retried->>'id'=r->>'id' and (retried->>'duplicate_prevented')::boolean, 'duplicate retry';

  failed := false;
  begin
    perform public.save_project_progress(jsonb_build_object(
      'request_id',gen_random_uuid(),
      'execution_mode','linked',
      'project_id',a,
      'project_name','duplicate linked project'
    ));
  exception when others then
    failed := sqlerrm like '%المشروع موجود بالفعل في متابعة المشاريع%' or sqlstate='23505';
  end;
  assert failed, 'same linked project cannot have two progress rows';
  select count(*) into audit_count from public.audit_log where entity_id=r->>'id' and action='create';
  assert audit_count=1, 'retry must not create another audit event';
  p := p || jsonb_build_object('request_id',gen_random_uuid(),'id',r->>'id','expected_updated_at',r->>'updated_at','contract_quantity',1,'historical_before_system',200,'execution_percent',0);
  stale := p;
  r := public.save_project_progress(p);
  select * into row_data from public.v_project_progress where id=(r->>'id')::uuid;
  assert row_data.execution_percent>=20000, 'execution >100 and client percentage ignored';
  failed := false;
  begin perform public.save_project_progress(stale || jsonb_build_object('request_id',gen_random_uuid()));
  exception when others then failed := sqlerrm like '%السجل اتعدل بواسطة مستخدم آخر%'; end;
  assert failed, 'stale concurrent edit must conflict';
  p := p || jsonb_build_object('request_id',gen_random_uuid(),'expected_updated_at',r->>'updated_at','project_id',b,'historical_before_system',0);
  r := public.save_project_progress(p);
  select * into row_data from public.v_project_progress where id=(r->>'id')::uuid;
  select public.round2(coalesce(sum(meters),0)) into qty from public.submissions where project_id=b;
  assert row_data.executed_quantity=qty, 'A -> B uses B only';
  p := p || jsonb_build_object('request_id',gen_random_uuid(),'expected_updated_at',r->>'updated_at','execution_mode','manual','project_id','','manual_executed_quantity',7);
  r := public.save_project_progress(p);
  select * into row_data from public.v_project_progress where id=(r->>'id')::uuid;
  assert row_data.project_id is null and row_data.executed_quantity=7 and row_data.historical_before_system=0, 'linked -> manual';
  p := p || jsonb_build_object('request_id',gen_random_uuid(),'expected_updated_at',r->>'updated_at','execution_mode','linked','project_id',a,'historical_before_system',0);
  r := public.save_project_progress(p);
  select * into row_data from public.v_project_progress where id=(r->>'id')::uuid;
  assert row_data.project_id=a and row_data.manual_executed_quantity is null, 'manual -> linked';
  p := p || jsonb_build_object('request_id',gen_random_uuid(),'expected_updated_at',r->>'updated_at');
  perform public.delete_project_progress((r->>'id')::uuid);
  failed := false;
  begin perform public.save_project_progress(p); exception when others then failed := sqlerrm like '%تم حذف%'; end;
  assert failed, 'delete during edit must not recreate';
  assert exists(select 1 from public.audit_log where entity_id=r->>'id' and action='delete' and details ? 'before'), 'delete audited';

  select * into legacy from public.project_progress_records where source='excel_import' and project_name is null limit 1;
  assert legacy.id is not null, 'legacy fixture';
  r := public.save_project_progress(jsonb_build_object('request_id',gen_random_uuid(),'id',legacy.id,'expected_updated_at',legacy.updated_at,'execution_mode','manual','project_name','','notes','test legacy'));
  assert exists(select 1 from public.project_progress_records where id=legacy.id and legacy_excel_row=legacy.legacy_excel_row), 'Excel continuation row retained';

  p := jsonb_build_object('request_id',gen_random_uuid(),'execution_mode','manual','project_name','test alias '||gen_random_uuid(),'manual_executed_quantity',0);
  r := public.save_project_progress(p || jsonb_build_object('execution_mode','linked','project_id',a,'save_alias',true,'alias_name',p->>'project_name'));
  perform public.delete_project_progress((r->>'id')::uuid);
  retried := public.save_project_progress(p || jsonb_build_object('request_id',gen_random_uuid()));
  select * into row_data from public.v_project_progress where id=(retried->>'id')::uuid;
  assert row_data.project_id=a and row_data.project=p->>'project_name', 'known alias resolves and preserves original';
  failed := false;
  begin perform public.save_project_progress(p || jsonb_build_object('request_id',gen_random_uuid(),'execution_mode','linked','project_id',b,'save_alias',true,'alias_name',p->>'project_name'));
  exception when others then failed := sqlerrm like '%مربوط بمشروع آخر%'; end;
  assert failed, 'alias collision must not remap';

  assert public.resolve_project_input_name('مول انفينتى')='إنفينيتي', 'progress alias resolves for productivity';
  assert public.resolve_project_input_name('جامعه مصر')='جامعة مصر', 'legacy business alias resolves for productivity';

  select a.alias,a.project_id into alias_name,alias_project_id
  from public.project_aliases a
  order by a.created_at
  limit 1;
  select name into active_section from public.sections where active=true order by name limit 1;
  if alias_name is not null and active_section is not null then
    submission_result := public.create_productivity_submission(
      public.business_today(), alias_name, active_section, 0,
      '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[],
      'progress_integration_test', gen_random_uuid()
    );
    assert exists(
      select 1 from public.submissions
      where id=(submission_result->>'id')::uuid
        and project_id=alias_project_id
    ), 'productivity alias must use canonical project_id';
  end if;

  failed := false;
  begin perform public.save_project_progress(p || jsonb_build_object('request_id',gen_random_uuid(),'contract_quantity','NaN'));
  exception when others then failed := true; end; assert failed, 'NaN rejected';
  failed := false;
  begin perform public.save_project_progress(p || jsonb_build_object('request_id',gen_random_uuid(),'contract_quantity',-1));
  exception when others then failed := true; end; assert failed, 'negative rejected';
  failed := false;
  begin perform public.save_project_progress(p || jsonb_build_object('request_id',gen_random_uuid(),'report_date',public.business_today()+1));
  exception when others then failed := sqlerrm like '%المستقبل%'; end; assert failed, 'future date rejected';
  failed := false;
  begin perform public.save_project_progress(p || jsonb_build_object('request_id',gen_random_uuid(),'execution_mode','linked'));
  exception when others then failed := true; end; assert failed, 'linked requires ID';
  if entry_id is not null then
    perform set_config('request.jwt.claim.sub',entry_id::text,true);
    failed := false;
    begin perform public.delete_project_progress((retried->>'id')::uuid); exception when others then failed := sqlerrm like '%Admin%'; end;
    assert failed, 'data entry cannot delete';
    failed := false;
    begin perform public.save_project_progress(p || jsonb_build_object('request_id',gen_random_uuid(),'execution_mode','linked','project_id',a,'save_alias',true,'alias_name','test'));
    exception when others then failed := sqlerrm like '%Admin%'; end; assert failed, 'data entry cannot save aliases';
  end if;
  perform set_config('request.jwt.claim.sub','',true);
  failed := false;
  begin perform public.save_project_progress(p); exception when others then failed := sqlerrm like '%تسجيل الدخول%'; end;
  assert failed, 'anonymous denied';
  assert not has_function_privilege('authenticated','private.write_project_progress(jsonb)','execute'), 'inner writer not exposed';
  assert not has_function_privilege('anon','public.save_project_progress(jsonb)','execute'), 'anonymous RPC denied';
  assert not has_table_privilege('authenticated','public.project_progress_records','update'), 'direct overwrite denied';
end $$;
rollback;
select 'PASS: progress integration assertions; all fixture writes rolled back' as result;
