-- Production hardening: financial integrity, attendance consistency, role history, closed-cycle writes.
-- Generated from the live production contract on 2026-10-10.

-- Data Entry may only create/write inside the single active cycle.
create or replace function private.enforce_active_cycle_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_active_key text;
  v_row_key text;
begin
  if v_uid is null then
    return new;
  end if;

  select app_role into v_role
  from public.profiles
  where user_id = v_uid;

  if v_role = 'data_entry'::public.app_role then
    v_active_key := public.active_cycle_month_key();
    v_row_key := public.current_cycle_month_key(new.work_date);

    if v_row_key is distinct from v_active_key then
      raise exception 'الدورة % مغلقة لإدخال البيانات. التعديل أو الإضافة خارج الدورة النشطة متاح للـ Admin فقط', v_row_key;
    end if;
  end if;

  return new;
end
$$;

revoke all on function private.enforce_active_cycle_write() from public, anon, authenticated;

drop trigger if exists submissions_active_cycle_write_guard on public.submissions;
create trigger submissions_active_cycle_write_guard
before insert or update of work_date on public.submissions
for each row execute function private.enforce_active_cycle_write();


-- If productivity exists, attendance is Present. Remove a conflicting absence atomically
-- and preserve the correction in the audit trail.
create or replace function private.clear_conflicting_absence_on_productivity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_date date;
  v_absence public.absence_type;
  v_uid uuid := auth.uid();
  v_person_name text;
begin
  select work_date into v_work_date
  from public.submissions
  where id = new.submission_id;

  if v_work_date is null then
    return new;
  end if;

  delete from public.attendance_absence_log
  where person_id = new.person_id
    and attendance_date = v_work_date
  returning absence_type into v_absence;

  if found then
    select name into v_person_name
    from public.people
    where id = new.person_id;

    insert into public.audit_log(user_id, action, entity_type, entity_id, details)
    values(
      v_uid,
      'absence_auto_cleared',
      'attendance',
      new.person_id::text || ':' || v_work_date::text,
      jsonb_build_object(
        'person_id', new.person_id,
        'person_name', coalesce(v_person_name, ''),
        'date', v_work_date,
        'before', v_absence,
        'after', null,
        'reason', 'productivity_recorded'
      )
    );
  end if;

  return new;
end
$$;

revoke all on function private.clear_conflicting_absence_on_productivity() from public, anon, authenticated;

drop trigger if exists submission_people_clear_conflicting_absence on public.submission_people;
create trigger submission_people_clear_conflicting_absence
after insert on public.submission_people
for each row execute function private.clear_conflicting_absence_on_productivity();


-- Preserve role history: when an existing person with history changes role,
-- deactivate the old role identity and create a new identity for the new role.
create or replace function public.admin_save_person(
  p_id uuid,
  p_name text,
  p_role public.person_role,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_old public.people;
  v_new public.people;
  v_has_history boolean := false;
  v_clean_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null or not exists(
    select 1 from public.profiles
    where user_id = v_uid and app_role = 'admin'
  ) then
    raise exception 'صلاحية Admin مطلوبة';
  end if;

  if v_clean_name = '' then
    raise exception 'الاسم مطلوب';
  end if;

  if p_id is null then
    insert into public.people(name, role, active)
    values(v_clean_name, p_role, coalesce(p_active, true))
    returning * into v_new;

    v_id := v_new.id;

    insert into public.audit_log(user_id, action, entity_type, entity_id, details)
    values(v_uid, 'create', 'person', v_id::text,
      jsonb_build_object('after', to_jsonb(v_new), 'reversible', false));
  else
    select * into v_old
    from public.people
    where id = p_id;

    if not found then
      raise exception 'الشخص غير موجود';
    end if;

    if v_old.role is distinct from p_role then
      select
        exists(select 1 from public.submission_people where person_id = p_id)
        or exists(select 1 from public.attendance_absence_log where person_id = p_id)
        or exists(select 1 from public.attendance_notes where person_id = p_id)
      into v_has_history;
    end if;

    if v_old.role is distinct from p_role and v_has_history then
      if exists(
        select 1 from public.people
        where id <> p_id and name = v_clean_name and role = p_role
      ) then
        raise exception 'يوجد بالفعل سجل بنفس الاسم والدور الجديد. راجع السجل الموجود قبل تغيير الدور';
      end if;

      update public.people
      set active = false,
          updated_at = now()
      where id = p_id;

      insert into public.people(name, role, active)
      values(v_clean_name, p_role, coalesce(p_active, true))
      returning * into v_new;

      v_id := v_new.id;

      insert into public.audit_log(user_id, action, entity_type, entity_id, details)
      values(
        v_uid,
        'role_transition',
        'person',
        p_id::text,
        jsonb_build_object(
          'before', to_jsonb(v_old),
          'after', to_jsonb(v_new),
          'new_person_id', v_new.id,
          'history_preserved_on_person_id', p_id,
          'reversible', false
        )
      );
    else
      update public.people
      set name = v_clean_name,
          role = p_role,
          active = coalesce(p_active, true),
          updated_at = now()
      where id = p_id
      returning * into v_new;

      v_id := v_new.id;

      insert into public.audit_log(user_id, action, entity_type, entity_id, details)
      values(v_uid, 'update', 'person', v_id::text,
        jsonb_build_object('before', to_jsonb(v_old), 'after', to_jsonb(v_new), 'reversible', false));
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'الاسم موجود بالفعل في نفس الدور';
end
$$;

revoke all on function public.admin_save_person(uuid, text, public.person_role, boolean) from public, anon;
grant execute on function public.admin_save_person(uuid, text, public.person_role, boolean) to authenticated;


-- Repair already-existing attendance/productivity conflicts.
insert into public.audit_log(user_id, action, entity_type, entity_id, details)
select
  null,
  'integrity_repair',
  'attendance',
  a.person_id::text || ':' || a.attendance_date::text,
  jsonb_build_object(
    'person_id', a.person_id,
    'date', a.attendance_date,
    'before_absence_type', a.absence_type,
    'after', 'present',
    'reason', 'existing_productivity_conflict'
  )
from public.attendance_absence_log a
where exists(
  select 1
  from public.submission_people sp
  join public.submissions s on s.id = sp.submission_id
  where sp.person_id = a.person_id
    and s.work_date = a.attendance_date
);

delete from public.attendance_absence_log a
where exists(
  select 1
  from public.submission_people sp
  join public.submissions s on s.id = sp.submission_id
  where sp.person_id = a.person_id
    and s.work_date = a.attendance_date
);


-- Reconcile legacy Google Sheet rows to the currently approved business rules:
-- operation total = meters * historical price snapshot
-- technician/assistant split = system_state shares when both exist
-- only one of technician/assistant present => that role receives 100%
-- worker pool = meters * worker_rate_per_meter
-- individual cents are distributed deterministically so they sum exactly to group totals.
create temporary table legacy_repair_expected on commit drop as
with counts as (
  select
    s.id,
    count(*) filter (where sp.role = 'technician')::int as tech_count,
    count(*) filter (where sp.role = 'assistant')::int as assistant_count,
    count(*) filter (where sp.role = 'worker')::int as worker_count
  from public.submissions s
  left join public.submission_people sp on sp.submission_id = s.id
  where s.legacy_source = 'google_sheet_live'
  group by s.id
),
state as (
  select tech_share, assistant_share, worker_rate_per_meter
  from public.system_state
  where id = 1
)
select
  s.id,
  c.tech_count,
  c.assistant_count,
  c.worker_count,
  case
    when c.tech_count > 0 and c.assistant_count > 0 then public.round2(s.total * st.tech_share)
    when c.tech_count > 0 then s.total
    else 0::numeric
  end::numeric(16,2) as tech_total,
  case
    when c.tech_count > 0 and c.assistant_count > 0 then public.round2(s.total - public.round2(s.total * st.tech_share))
    when c.assistant_count > 0 then s.total
    else 0::numeric
  end::numeric(16,2) as assistant_total,
  case
    when c.worker_count > 0 then public.round2(s.meters * st.worker_rate_per_meter)
    else 0::numeric
  end::numeric(16,2) as worker_total
from public.submissions s
join counts c on c.id = s.id
cross join state st
where s.legacy_source = 'google_sheet_live';

insert into public.audit_log(user_id, action, entity_type, entity_id, details)
select
  null,
  'integrity_repair',
  'submission',
  s.id::text,
  jsonb_build_object(
    'reason', 'legacy_financial_reconciliation',
    'before', jsonb_build_object(
      'tech_share_total', s.tech_share_total,
      'tech_share_per_person', s.tech_share_per_person,
      'assistant_share_total', s.assistant_share_total,
      'assistant_share_per_person', s.assistant_share_per_person,
      'worker_share_total', s.worker_share_total,
      'worker_share_per_person', s.worker_share_per_person,
      'technician_count_snapshot', s.technician_count_snapshot,
      'assistant_count_snapshot', s.assistant_count_snapshot,
      'worker_count_snapshot', s.worker_count_snapshot
    ),
    'after', jsonb_build_object(
      'tech_share_total', e.tech_total,
      'tech_share_per_person', case when e.tech_count > 0 then public.round2(e.tech_total / e.tech_count) else 0 end,
      'assistant_share_total', e.assistant_total,
      'assistant_share_per_person', case when e.assistant_count > 0 then public.round2(e.assistant_total / e.assistant_count) else 0 end,
      'worker_share_total', e.worker_total,
      'worker_share_per_person', case when e.worker_count > 0 then public.round2(e.worker_total / e.worker_count) else 0 end,
      'technician_count_snapshot', e.tech_count,
      'assistant_count_snapshot', e.assistant_count,
      'worker_count_snapshot', e.worker_count
    ),
    'policy', jsonb_build_object(
      'tech_share', (select tech_share from public.system_state where id = 1),
      'assistant_share', (select assistant_share from public.system_state where id = 1),
      'worker_rate_per_meter', (select worker_rate_per_meter from public.system_state where id = 1)
    )
  )
from public.submissions s
join legacy_repair_expected e on e.id = s.id
where
  s.tech_share_total is distinct from e.tech_total
  or s.assistant_share_total is distinct from e.assistant_total
  or s.worker_share_total is distinct from e.worker_total
  or s.technician_count_snapshot is distinct from e.tech_count
  or s.assistant_count_snapshot is distinct from e.assistant_count
  or s.worker_count_snapshot is distinct from e.worker_count
  or exists(
    select 1
    from public.submission_people sp
    where sp.submission_id = s.id
    group by sp.submission_id
    having
      coalesce(sum(sp.share_amount) filter(where sp.role='technician'),0) is distinct from e.tech_total
      or coalesce(sum(sp.share_amount) filter(where sp.role='assistant'),0) is distinct from e.assistant_total
      or coalesce(sum(sp.share_amount) filter(where sp.role='worker'),0) is distinct from e.worker_total
  );

update public.submissions s
set
  tech_share_total = e.tech_total,
  tech_share_per_person = case when e.tech_count > 0 then public.round2(e.tech_total / e.tech_count) else 0 end,
  assistant_share_total = e.assistant_total,
  assistant_share_per_person = case when e.assistant_count > 0 then public.round2(e.assistant_total / e.assistant_count) else 0 end,
  worker_share_total = e.worker_total,
  worker_share_per_person = case when e.worker_count > 0 then public.round2(e.worker_total / e.worker_count) else 0 end,
  technician_count_snapshot = e.tech_count,
  assistant_count_snapshot = e.assistant_count,
  worker_count_snapshot = e.worker_count,
  updated_at = now()
from legacy_repair_expected e
where s.id = e.id;

with ranked as (
  select
    sp.submission_id,
    sp.person_id,
    sp.role,
    row_number() over(partition by sp.submission_id, sp.role order by sp.person_id)::int as rn,
    count(*) over(partition by sp.submission_id, sp.role)::int as group_count,
    case sp.role
      when 'technician'::public.person_role then e.tech_total
      when 'assistant'::public.person_role then e.assistant_total
      when 'worker'::public.person_role then e.worker_total
      else 0::numeric
    end as role_total
  from public.submission_people sp
  join legacy_repair_expected e on e.id = sp.submission_id
),
expected as (
  select
    submission_id,
    person_id,
    role,
    group_count,
    (
      (
        (round(role_total * 100)::bigint / group_count)
        + case
            when rn <= (round(role_total * 100)::bigint % group_count)::int then 1
            else 0
          end
      )::numeric / 100
    )::numeric(16,2) as share_amount
  from ranked
)
update public.submission_people sp
set
  share_amount = e.share_amount,
  group_size = e.group_count
from expected e
where sp.submission_id = e.submission_id
  and sp.person_id = e.person_id;


-- Ensure public report view exposes stable project identity so renamed projects
-- stay one project across their complete history.
create or replace view public.v_master_data
with (security_invoker = true)
as
select
  s.id,
  s.project_id,
  s.section_id,
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
  s.updated_at
from public.submissions s
left join public.submission_notes sn on sn.submission_id = s.id;

grant select on public.v_master_data to authenticated;
revoke all on public.v_master_data from anon;
