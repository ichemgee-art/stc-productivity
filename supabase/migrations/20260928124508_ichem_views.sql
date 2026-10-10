
create or replace view public.v_master_data
with (security_invoker=true)
as
select
  s.id,
  s.submitted_at,
  s.work_date,
  coalesce((select string_agg(p.name,'، ' order by p.name) from public.submission_people sp join public.people p on p.id=sp.person_id where sp.submission_id=s.id and sp.role='engineer'),'') engineers,
  coalesce((select string_agg(p.name,'، ' order by p.name) from public.submission_people sp join public.people p on p.id=sp.person_id where sp.submission_id=s.id and sp.role='technician'),'') technicians,
  (select count(*) from public.submission_people sp where sp.submission_id=s.id and sp.role='technician') technician_count,
  coalesce((select string_agg(p.name,'، ' order by p.name) from public.submission_people sp join public.people p on p.id=sp.person_id where sp.submission_id=s.id and sp.role='assistant'),'') assistants,
  (select count(*) from public.submission_people sp where sp.submission_id=s.id and sp.role='assistant') assistant_count,
  s.project_name_snapshot project,
  s.section_name_snapshot section,
  s.meters,
  s.price_per_meter,
  s.total,
  s.tech_share_total,
  s.tech_share_per_person,
  s.assistant_share_total,
  s.assistant_share_per_person,
  coalesce((select string_agg(p.name,'، ' order by p.name) from public.submission_people sp join public.people p on p.id=sp.person_id where sp.submission_id=s.id and sp.role='worker'),'') workers,
  (select count(*) from public.submission_people sp where sp.submission_id=s.id and sp.role='worker') worker_count,
  s.worker_share_total,
  s.worker_share_per_person,
  s.review_status,
  public.review_status_ar(s.review_status) review_status_ar,
  s.price_missing,
  s.source
from public.submissions s;

create or replace view public.v_master_data_ar
with (security_invoker=true)
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

create or replace view public.v_person_operations
with (security_invoker=true)
as
select
 p.id person_id,p.name person_name,p.role,s.id submission_id,s.work_date,
 s.project_name_snapshot project,s.section_name_snapshot section,s.meters,
 sp.share_amount,sp.group_size,
 coalesce((
   select string_agg(p2.name,'، ' order by p2.name)
   from public.submission_people sp2 join public.people p2 on p2.id=sp2.person_id
   where sp2.submission_id=s.id and sp2.role=sp.role and sp2.person_id<>sp.person_id
 ),'') partners
from public.submission_people sp
join public.people p on p.id=sp.person_id
join public.submissions s on s.id=sp.submission_id;

create or replace view public.v_project_autocomplete
with (security_invoker=true)
as
select p.id,p.name,count(s.id)::bigint use_count,max(s.work_date) last_used
from public.projects p left join public.submissions s on s.project_id=p.id
where p.active=true
group by p.id,p.name
order by last_used desc nulls last,use_count desc,p.name;

