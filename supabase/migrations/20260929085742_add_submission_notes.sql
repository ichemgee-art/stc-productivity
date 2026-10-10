
alter table public.submissions
  add column if not exists notes text not null default '';

create or replace view public.v_master_data
with (security_invoker = true)
as
select
  id,
  submitted_at,
  work_date,
  engineer_names_snapshot as engineers,
  technician_names_snapshot as technicians,
  technician_count_snapshot::bigint as technician_count,
  assistant_names_snapshot as assistants,
  assistant_count_snapshot::bigint as assistant_count,
  project_name_snapshot as project,
  section_name_snapshot as section,
  meters,
  price_per_meter,
  total,
  tech_share_total,
  tech_share_per_person,
  assistant_share_total,
  assistant_share_per_person,
  worker_names_snapshot as workers,
  worker_count_snapshot::bigint as worker_count,
  worker_share_total,
  worker_share_per_person,
  review_status,
  review_status_ar(review_status) as review_status_ar,
  price_missing,
  source,
  notes
from public.submissions s;

create or replace function public.set_submission_notes(
  p_submission_id uuid,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null
     or not exists (
       select 1
       from public.profiles
       where user_id = v_uid
         and app_role = 'admin'
     )
  then
    raise exception 'صلاحية Admin مطلوبة لتعديل الملاحظات';
  end if;

  update public.submissions
  set notes = left(coalesce(p_notes, ''), 2000),
      updated_at = now()
  where id = p_submission_id;

  if not found then
    raise exception 'العملية غير موجودة';
  end if;

  insert into public.audit_log(user_id, action, entity_type, entity_id, details)
  values(
    v_uid,
    'update_notes',
    'submission',
    p_submission_id::text,
    jsonb_build_object('notes', left(coalesce(p_notes, ''), 2000))
  );

  return jsonb_build_object('ok', true, 'id', p_submission_id);
end
$function$;

revoke execute on function public.set_submission_notes(uuid, text) from public, anon;
grant execute on function public.set_submission_notes(uuid, text) to authenticated;

