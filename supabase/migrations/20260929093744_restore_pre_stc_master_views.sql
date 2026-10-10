
drop function if exists public.set_submission_notes(uuid, text);

drop view if exists public.v_master_data_ar;
drop view if exists public.v_master_data;

alter table public.submissions
  drop column if exists notes;

create view public.v_master_data
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
  source
from public.submissions s;

create view public.v_master_data_ar
with (security_invoker = true)
as
select
  submitted_at as "وقت الإرسال",
  work_date as "التاريخ",
  engineers as "المهندس",
  technicians as "الفنيين المشاركين",
  technician_count as "عدد الفنيين",
  assistants as "مساعدين الممتاز المشاركين",
  assistant_count as "عدد المساعدين",
  project as "المشروع",
  section as "القطاع",
  meters as "عدد الأمتار",
  price_per_meter as "سعر المتر",
  total as "الإجمالي",
  tech_share_total as "إجمالي نصيب الفنيين",
  tech_share_per_person as "نصيب كل فني",
  assistant_share_total as "إجمالي نصيب المساعدين",
  assistant_share_per_person as "نصيب كل مساعد",
  workers as "العمال المشاركين",
  worker_count as "عدد العمال",
  worker_share_total as "إجمالي نصيب العمال",
  worker_share_per_person as "نصيب كل عامل",
  review_status_ar as "حالة المراجعة"
from public.v_master_data;

grant all on public.v_master_data to anon, authenticated, service_role;
grant all on public.v_master_data_ar to anon, authenticated, service_role;

