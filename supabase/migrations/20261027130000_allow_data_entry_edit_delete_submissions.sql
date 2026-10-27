-- Allow data-entry operators to correct and remove productivity submissions.
-- Review status, cycle control, people/projects/sections management remain admin-only.

do $$
declare
  rec record;
  ddl text;
begin
  for rec in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname in ('update_productivity_submission','delete_productivity_submission')
  loop
    ddl := pg_get_functiondef(rec.oid);

    ddl := replace(ddl,'and app_role=''admin''','and app_role in (''admin'',''data_entry'')');
    ddl := replace(ddl,'and app_role = ''admin''','and app_role in (''admin'',''data_entry'')');
    ddl := replace(ddl,'app_role=''admin''','app_role in (''admin'',''data_entry'')');
    ddl := replace(ddl,'app_role = ''admin''','app_role in (''admin'',''data_entry'')');

    ddl := replace(ddl,'صلاحية Admin مطلوبة للتعديل','صلاحية إدخال أو Admin مطلوبة للتعديل');
    ddl := replace(ddl,'صلاحية Admin مطلوبة للحذف','صلاحية إدخال أو Admin مطلوبة للحذف');

    execute ddl;
  end loop;
end $$;
