
alter table public.submissions drop constraint if exists submission_total_matches_price;
alter table public.submissions
  add constraint submission_total_matches_price
  check (total = public.round2(meters * price_per_meter));

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
  v_engineer_sum numeric := 0;
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

  if not found then
    return null;
  end if;

  if v_s.total <> public.round2(v_s.meters * v_s.price_per_meter) then
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
    coalesce(sum(sp.share_amount) filter (where sp.role = 'engineer'), 0),
    coalesce(sum(sp.share_amount) filter (where sp.role = 'technician'), 0),
    coalesce(sum(sp.share_amount) filter (where sp.role = 'assistant'), 0),
    coalesce(sum(sp.share_amount) filter (where sp.role = 'worker'), 0),
    count(*) filter (where p.id is null or p.role <> sp.role)
  into
    v_tech_count,
    v_assistant_count,
    v_worker_count,
    v_engineer_sum,
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

  if v_engineer_sum <> 0 then
    raise exception 'فشل تحقق سلامة العملية: نصيب المهندس يجب أن يساوي صفر';
  end if;

  if v_s.technician_count_snapshot <> v_tech_count
     or v_s.assistant_count_snapshot <> v_assistant_count
     or v_s.worker_count_snapshot <> v_worker_count then
    raise exception 'فشل تحقق سلامة العملية: عدد أفراد الفريق لا يطابق Snapshot العملية';
  end if;

  if v_s.tech_share_total <> v_tech_sum
     or v_s.assistant_share_total <> v_assistant_sum
     or v_s.worker_share_total <> v_worker_sum then
    raise exception 'فشل تحقق سلامة العملية: مجموع أنصبة الأفراد لا يطابق إجمالي المجموعة';
  end if;

  if (v_tech_count = 0 and (v_s.tech_share_total <> 0 or v_s.tech_share_per_person <> 0))
     or (v_tech_count > 0 and v_s.tech_share_per_person <> public.round2(v_s.tech_share_total / v_tech_count)) then
    raise exception 'فشل تحقق سلامة العملية: نصيب الفني للفرد غير متوافق';
  end if;

  if (v_assistant_count = 0 and (v_s.assistant_share_total <> 0 or v_s.assistant_share_per_person <> 0))
     or (v_assistant_count > 0 and v_s.assistant_share_per_person <> public.round2(v_s.assistant_share_total / v_assistant_count)) then
    raise exception 'فشل تحقق سلامة العملية: نصيب المساعد للفرد غير متوافق';
  end if;

  if (v_worker_count = 0 and (v_s.worker_share_total <> 0 or v_s.worker_share_per_person <> 0))
     or (v_worker_count > 0 and v_s.worker_share_per_person <> public.round2(v_s.worker_share_total / v_worker_count)) then
    raise exception 'فشل تحقق سلامة العملية: نصيب العامل للفرد غير متوافق';
  end if;

  if v_tech_count > 0 and v_assistant_count > 0
     and (v_s.tech_share_total + v_s.assistant_share_total) <> v_s.total then
    raise exception 'فشل تحقق سلامة العملية: توزيع الفنيين والمساعدين لا يساوي إجمالي العملية';
  elsif v_tech_count > 0 and v_assistant_count = 0
     and v_s.tech_share_total <> v_s.total then
    raise exception 'فشل تحقق سلامة العملية: إجمالي نصيب الفنيين غير متوافق';
  elsif v_assistant_count > 0 and v_tech_count = 0
     and v_s.assistant_share_total <> v_s.total then
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

