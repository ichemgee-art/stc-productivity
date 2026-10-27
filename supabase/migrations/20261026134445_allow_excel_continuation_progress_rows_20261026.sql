alter table public.project_progress_records
  drop constraint if exists project_progress_project_required;

alter table public.project_progress_records
  add constraint project_progress_project_required check (
    source='excel_import'
    or
    (execution_mode='linked' and project_id is not null)
    or
    (execution_mode='manual' and nullif(btrim(coalesce(project_name,'')),'') is not null)
  );
