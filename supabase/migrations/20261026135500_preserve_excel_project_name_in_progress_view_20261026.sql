
create or replace view public.v_project_progress
with (security_invoker=true)
as
with prod as (
  select
    s.project_id,
    public.round2(coalesce(sum(s.meters),0)) as productivity_meters
  from public.submissions s
  where s.project_id is not null
  group by s.project_id
)
select
  r.id,
  r.report_date,
  r.review_yahya_date,
  r.review_marina_date,
  r.review_abdelrahman_date,
  r.display_number,
  r.project_id,
  coalesce(nullif(r.project_name,''),p.name,'') as project,
  r.project_name as project_name_snapshot,
  r.location,
  r.contract_quantity,
  r.historical_before_system,
  r.manual_executed_quantity,
  r.execution_mode,
  case
    when r.execution_mode='linked'
      then public.round2(r.historical_before_system + coalesce(prod.productivity_meters,0))
    else public.round2(coalesce(r.manual_executed_quantity,0))
  end as executed_quantity,
  coalesce(prod.productivity_meters,0) as productivity_meters,
  case
    when r.contract_quantity is not null and r.contract_quantity > 0 then
      public.round2(
        (
          case
            when r.execution_mode='linked'
              then r.historical_before_system + coalesce(prod.productivity_meters,0)
            else coalesce(r.manual_executed_quantity,0)
          end
        ) / r.contract_quantity * 100
      )
    else null
  end as execution_percent,
  r.financial_status,
  r.contract_type,
  r.responsible_team,
  r.notes,
  r.excel_executed_snapshot,
  r.excel_execution_percent_snapshot,
  r.source,
  r.legacy_excel_row,
  r.created_by,
  r.updated_by,
  r.created_at,
  r.updated_at
from public.project_progress_records r
left join public.projects p on p.id=r.project_id
left join prod on prod.project_id=r.project_id;

revoke all on public.v_project_progress from anon, authenticated;
grant select on public.v_project_progress to authenticated, service_role;
notify pgrst,'reload schema';
