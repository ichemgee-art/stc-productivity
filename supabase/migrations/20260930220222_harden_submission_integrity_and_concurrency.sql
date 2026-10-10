
create or replace function private.enforce_submission_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_s public.submissions;
  v_tech_count integer := 0;
  v_assistant_count integer := 0;
  v_worker_count integer := 0;
  v_tech_sum numeric := 0;
  v_assistant_sum numeric := 0;
  v_worker_sum numeric := 0;
  v_bad_roles integer := 0;
  v_bad_group_sizes integer := 0;
begin
  if tg_table_name = 'submissions' then
    v_id := coalesce(new.id, old.id);
  else
    v_id := coalesce(new.submission_id, old.submission_id);
  end if;

  select * into v_s
  from public.submissions
  where id = v_id;

  -- Parent deletion / cascade deletion is valid.
  if not found then
    return null;
  end if;

  if abs(v_s.total - public.round2(v_s.meters * v_s.price_per_meter)) > 0.01 then
    raise exception 'فشل تحقق سلامة العملية: الإجمالي لا يساوي الأمتار × سعر المتر';
  end if;

  if v_s.total < 0
     or v_s.tech_share_total < 0
     or v_s.tech_share_per_person < 0
     or v_s.assistant_share_total < 0
     or v_s.assistant_share_per_person < 0
     or v_s.worker_share_total < 0
     or v_s.worker_share_per_person < 0 then
    raise exception 'فشل تحقق سلامة العملية: توجد قيمة مالية سالبة';
  end if;

  select
    count(*) filter (where sp.role = 'technician')::int,
    count(*) filter (where sp.role = 'assistant')::int,
    count(*) filter (where sp.role = 'worker')::int,
    coalesce(sum(sp.share_amount) filter (where sp.role = 'technician'), 0),
    coalesce(sum(sp.share_amount) filter (where sp.role = 'assistant'), 0),
    coalesce(sum(sp.share_amount) filter (where sp.role = 'worker'), 0),
    count(*) filter (where p.id is null or p.role <> sp.role)
  into
    v_tech_count,
    v_assistant_count,
    v_worker_count,
    v_tech_sum,
    v_assistant_sum,
    v_worker_sum,
    v_bad_roles
  from public.submission_people sp
  left join public.people p on p.id = sp.person_id
  where sp.submission_id = v_id;

  select count(*) into v_bad_group_sizes
  from public.submission_people sp
  where sp.submission_id = v_id
    and sp.group_size <> (
      select count(*)::int
      from public.submission_people same_role
      where same_role.submission_id = v_id
        and same_role.role = sp.role
    );

  if v_bad_roles > 0 then
    raise exception 'فشل تحقق سلامة العملية: يوجد شخص بدور غير مطابق';
  end if;

  if v_bad_group_sizes > 0 then
    raise exception 'فشل تحقق سلامة العملية: حجم المجموعة لا يطابق عدد المشاركين';
  end if;

  if v_s.technician_count_snapshot <> v_tech_count
     or v_s.assistant_count_snapshot <> v_assistant_count
     or v_s.worker_count_snapshot <> v_worker_count then
    raise exception 'فشل تحقق سلامة العملية: عدد أفراد الفريق لا يطابق Snapshot العملية';
  end if;

  if abs(v_s.tech_share_total - v_tech_sum) > 0.01
     or abs(v_s.assistant_share_total - v_assistant_sum) > 0.01
     or abs(v_s.worker_share_total - v_worker_sum) > 0.01 then
    raise exception 'فشل تحقق سلامة العملية: مجموع أنصبة الأفراد لا يطابق إجمالي المجموعة';
  end if;

  if (v_tech_count = 0 and (v_s.tech_share_total <> 0 or v_s.tech_share_per_person <> 0))
     or (v_tech_count > 0 and abs(v_s.tech_share_per_person - public.round2(v_s.tech_share_total / v_tech_count)) > 0.01) then
    raise exception 'فشل تحقق سلامة العملية: نصيب الفني للفرد غير متوافق';
  end if;

  if (v_assistant_count = 0 and (v_s.assistant_share_total <> 0 or v_s.assistant_share_per_person <> 0))
     or (v_assistant_count > 0 and abs(v_s.assistant_share_per_person - public.round2(v_s.assistant_share_total / v_assistant_count)) > 0.01) then
    raise exception 'فشل تحقق سلامة العملية: نصيب المساعد للفرد غير متوافق';
  end if;

  if (v_worker_count = 0 and (v_s.worker_share_total <> 0 or v_s.worker_share_per_person <> 0))
     or (v_worker_count > 0 and abs(v_s.worker_share_per_person - public.round2(v_s.worker_share_total / v_worker_count)) > 0.01) then
    raise exception 'فشل تحقق سلامة العملية: نصيب العامل للفرد غير متوافق';
  end if;

  if v_tech_count > 0 and v_assistant_count > 0
     and abs((v_s.tech_share_total + v_s.assistant_share_total) - v_s.total) > 0.01 then
    raise exception 'فشل تحقق سلامة العملية: توزيع الفنيين والمساعدين لا يساوي إجمالي العملية';
  elsif v_tech_count > 0 and v_assistant_count = 0
     and abs(v_s.tech_share_total - v_s.total) > 0.01 then
    raise exception 'فشل تحقق سلامة العملية: إجمالي نصيب الفنيين غير متوافق';
  elsif v_assistant_count > 0 and v_tech_count = 0
     and abs(v_s.assistant_share_total - v_s.total) > 0.01 then
    raise exception 'فشل تحقق سلامة العملية: إجمالي نصيب المساعدين غير متوافق';
  elsif v_tech_count = 0 and v_assistant_count = 0
     and (v_s.tech_share_total <> 0 or v_s.assistant_share_total <> 0) then
    raise exception 'فشل تحقق سلامة العملية: توجد أنصبة بدون فنيين أو مساعدين';
  end if;

  return null;
end
$$;

revoke all on function private.enforce_submission_integrity() from public, anon, authenticated;
grant execute on function private.enforce_submission_integrity() to postgres;

drop trigger if exists submissions_integrity_deferred on public.submissions;
create constraint trigger submissions_integrity_deferred
after insert or update of meters, price_per_meter, total,
  tech_share_total, tech_share_per_person,
  assistant_share_total, assistant_share_per_person,
  worker_share_total, worker_share_per_person,
  technician_count_snapshot, assistant_count_snapshot, worker_count_snapshot
on public.submissions
deferrable initially deferred
for each row
execute function private.enforce_submission_integrity();

drop trigger if exists submission_people_integrity_deferred on public.submission_people;
create constraint trigger submission_people_integrity_deferred
after insert or update or delete
on public.submission_people
deferrable initially deferred
for each row
execute function private.enforce_submission_integrity();

alter table public.submissions
  add constraint submission_total_nonnegative
  check (
    total >= 0
    and tech_share_total >= 0
    and tech_share_per_person >= 0
    and assistant_share_total >= 0
    and assistant_share_per_person >= 0
    and worker_share_total >= 0
    and worker_share_per_person >= 0
  ) not valid;

alter table public.submissions
  add constraint submission_total_matches_price
  check (abs(total - public.round2(meters * price_per_meter)) <= 0.01) not valid;

alter table public.system_state
  add constraint low_count_threshold_nonnegative
  check (low_count_threshold >= 0) not valid;

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
  coalesce(sn.note, ''::text) as note,
  s.updated_at
from public.submissions s
left join public.submission_notes sn on sn.submission_id = s.id;

create or replace function public.update_productivity_submission(
  p_submission_id uuid,
  p_work_date date,
  p_project_name text,
  p_section_name text,
  p_meters numeric,
  p_engineer_ids uuid[],
  p_technician_ids uuid[],
  p_assistant_ids uuid[],
  p_worker_ids uuid[],
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current_updated_at timestamptz;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles
    where user_id = v_uid and app_role = 'admin'
  ) then
    raise exception 'صلاحية Admin مطلوبة للتعديل';
  end if;

  select updated_at
  into v_current_updated_at
  from public.submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'العملية غير موجودة';
  end if;

  if p_expected_updated_at is not null
     and v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'تم تعديل العملية بواسطة مستخدم آخر. أعد فتح العملية ثم جرّب مرة أخرى';
  end if;

  return public.update_productivity_submission(
    p_submission_id,
    p_work_date,
    p_project_name,
    p_section_name,
    p_meters,
    p_engineer_ids,
    p_technician_ids,
    p_assistant_ids,
    p_worker_ids
  );
end
$$;

revoke all on function public.update_productivity_submission(
  uuid,date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],timestamptz
) from public, anon;

grant execute on function public.update_productivity_submission(
  uuid,date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],timestamptz
) to authenticated, service_role;

