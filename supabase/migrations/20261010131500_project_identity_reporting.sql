-- Keep project reports connected across project renames without rewriting historical snapshots.
create or replace view public.v_master_data
with (security_invoker = true)
as
select
  s.id,
  s.submitted_at,
  s.work_date,
  s.engineer_names_snapshot as engineers,
  s.technician_names_snapshot as technicians,
  s.technician_count_snapshot::bigint as technician_count,
  s.assistant_names_snapshot as assistants,
  s.assistant_count_snapshot::bigint as assistant_count,
  s.project_name_snapshot as project,
  s.section_name_snapshot as section,
  s.meters,
  s.price_per_meter,
  s.total,
  s.tech_share_total,
  s.tech_share_per_person,
  s.assistant_share_total,
  s.assistant_share_per_person,
  s.worker_names_snapshot as workers,
  s.worker_count_snapshot::bigint as worker_count,
  s.worker_share_total,
  s.worker_share_per_person,
  s.review_status,
  public.review_status_ar(s.review_status) as review_status_ar,
  s.price_missing,
  s.source,
  coalesce(sn.note, '') as note,
  s.updated_at,
  s.project_id,
  s.section_id,
  coalesce(p.name, s.project_name_snapshot) as project_current_name
from public.submissions s
left join public.submission_notes sn on sn.submission_id = s.id
left join public.projects p on p.id = s.project_id;

grant select on public.v_master_data to authenticated;
revoke all on public.v_master_data from anon;
