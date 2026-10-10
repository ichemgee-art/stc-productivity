
create or replace function public.round2(p_value numeric)
returns numeric language sql immutable parallel safe
as $$ select round(coalesce(p_value,0),2) $$;

create or replace function public.role_ar(p_role public.person_role)
returns text language sql immutable parallel safe
as $$ select case p_role when 'engineer' then 'مهندس' when 'technician' then 'فني' when 'assistant' then 'مساعد ممتاز' when 'worker' then 'عامل' end $$;

create or replace function public.review_status_ar(p_status public.review_status)
returns text language sql immutable parallel safe
as $$ select case p_status when 'reviewed' then 'تمت المراجعة' else 'لم تتم المراجعة' end $$;

create or replace function public.absence_type_ar(p_type public.absence_type)
returns text language sql immutable parallel safe
as $$ select case p_type when 'excused' then 'غياب بإذن' when 'unexcused' then 'غياب بدون إذن' else null end $$;

create or replace function public.cycle_bounds(p_month_key text)
returns table(cycle_start date,cycle_end date)
language plpgsql immutable
as $$
declare v_month date;
begin
  if p_month_key is null or p_month_key !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Invalid month key. Expected YYYY-MM';
  end if;
  v_month:=to_date(p_month_key||'-01','YYYY-MM-DD');
  cycle_start:=(v_month-interval '1 month'+interval '25 day')::date;
  cycle_end:=(v_month+interval '24 day')::date;
  return next;
end $$;

create or replace function public.current_cycle_month_key(p_ref date default current_date)
returns text language sql stable
as $$
select to_char(
  case when extract(day from p_ref)>=26
    then (date_trunc('month',p_ref)+interval '1 month')::date
    else date_trunc('month',p_ref)::date
  end,'YYYY-MM')
$$;

create or replace function public.active_cycle_month_key()
returns text language sql stable
as $$ select to_char(active_cycle_month,'YYYY-MM') from public.system_state where id=1 $$;

create or replace function public.previous_cycle_month_key(p_month_key text)
returns text language sql immutable
as $$ select to_char(to_date(p_month_key||'-01','YYYY-MM-DD')-interval '1 month','YYYY-MM') $$;

create or replace function public.assert_person_role(p_ids uuid[],p_role public.person_role)
returns void language plpgsql stable security invoker set search_path=''
as $$
declare v_bad integer;
begin
  if coalesce(array_length(p_ids,1),0)=0 then return; end if;
  select count(*) into v_bad
  from unnest(p_ids) u(id)
  left join public.people p on p.id=u.id and p.active=true and p.role=p_role
  where p.id is null;
  if v_bad>0 then raise exception 'One or more people are missing, inactive, or have the wrong role (%)',p_role; end if;
end $$;

create or replace function public.create_productivity_submission(
  p_work_date date,
  p_project_name text,
  p_section_name text,
  p_meters numeric,
  p_engineer_ids uuid[] default '{}'::uuid[],
  p_technician_ids uuid[] default '{}'::uuid[],
  p_assistant_ids uuid[] default '{}'::uuid[],
  p_worker_ids uuid[] default '{}'::uuid[],
  p_source text default 'web'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project public.projects;
  v_section public.sections;
  v_state public.system_state;
  v_submission public.submissions;
  v_total numeric(16,2);
  v_tech_total numeric(16,2):=0;
  v_assistant_total numeric(16,2):=0;
  v_worker_total numeric(16,2):=0;
  v_tech_per numeric(16,2):=0;
  v_assistant_per numeric(16,2):=0;
  v_worker_per numeric(16,2):=0;
  n_tech int:=coalesce(array_length(p_technician_ids,1),0);
  n_assist int:=coalesce(array_length(p_assistant_ids,1),0);
  n_worker int:=coalesce(array_length(p_worker_ids,1),0);
  n_eng int:=coalesce(array_length(p_engineer_ids,1),0);
  v_uid uuid:=auth.uid();
  v_person uuid;
begin
  if p_work_date is null then raise exception 'التاريخ مطلوب'; end if;
  if btrim(coalesce(p_project_name,''))='' then raise exception 'اسم المشروع مطلوب'; end if;
  if btrim(coalesce(p_section_name,''))='' then raise exception 'القطاع مطلوب'; end if;
  if coalesce(p_meters,0)<=0 then raise exception 'عدد الأمتار لازم يكون أكبر من صفر'; end if;
  if n_eng=0 then raise exception 'لازم تختار مهندس واحد على الأقل'; end if;

  if v_uid is not null and not exists(
    select 1 from public.profiles pr
    where pr.user_id=v_uid and pr.app_role in ('admin','data_entry')
  ) then
    raise exception 'غير مسموح لك بتسجيل الإنتاجية';
  end if;

  perform public.assert_person_role(p_engineer_ids,'engineer');
  perform public.assert_person_role(p_technician_ids,'technician');
  perform public.assert_person_role(p_assistant_ids,'assistant');
  perform public.assert_person_role(p_worker_ids,'worker');

  select * into v_state from public.system_state where id=1;

  insert into public.projects(name)
  values(btrim(regexp_replace(p_project_name,'\s+',' ','g')))
  on conflict(normalized_name) do update set active=true
  returning * into v_project;

  select * into v_section from public.sections where name=btrim(p_section_name) and active=true;
  if not found then raise exception 'القطاع % غير موجود أو غير مفعل',p_section_name; end if;

  v_total:=public.round2(p_meters*v_section.price_per_meter);

  if n_tech>0 and n_assist>0 then
    v_tech_total:=public.round2(v_total*v_state.tech_share);
    v_assistant_total:=public.round2(v_total*v_state.assistant_share);
  elsif n_tech>0 then
    v_tech_total:=v_total;
  elsif n_assist>0 then
    v_assistant_total:=v_total;
  end if;

  if n_tech>0 then v_tech_per:=public.round2(v_tech_total/n_tech); end if;
  if n_assist>0 then v_assistant_per:=public.round2(v_assistant_total/n_assist); end if;
  if n_worker>0 then
    v_worker_total:=public.round2(p_meters*v_state.worker_rate_per_meter);
    v_worker_per:=public.round2(v_worker_total/n_worker);
  end if;

  insert into public.submissions(
    work_date,project_id,section_id,project_name_snapshot,section_name_snapshot,
    meters,price_per_meter,total,
    tech_share_total,tech_share_per_person,
    assistant_share_total,assistant_share_per_person,
    worker_share_total,worker_share_per_person,
    review_status,price_missing,created_by,source
  ) values(
    p_work_date,v_project.id,v_section.id,v_project.name,v_section.name,
    public.round2(p_meters),v_section.price_per_meter,v_total,
    v_tech_total,v_tech_per,v_assistant_total,v_assistant_per,
    v_worker_total,v_worker_per,
    'not_reviewed',false,v_uid,coalesce(nullif(p_source,''),'web')
  ) returning * into v_submission;

  foreach v_person in array p_engineer_ids loop
    insert into public.submission_people(submission_id,person_id,role,share_amount,group_size)
    values(v_submission.id,v_person,'engineer',0,n_eng);
  end loop;
  foreach v_person in array p_technician_ids loop
    insert into public.submission_people(submission_id,person_id,role,share_amount,group_size)
    values(v_submission.id,v_person,'technician',v_tech_per,n_tech);
  end loop;
  foreach v_person in array p_assistant_ids loop
    insert into public.submission_people(submission_id,person_id,role,share_amount,group_size)
    values(v_submission.id,v_person,'assistant',v_assistant_per,n_assist);
  end loop;
  foreach v_person in array p_worker_ids loop
    insert into public.submission_people(submission_id,person_id,role,share_amount,group_size)
    values(v_submission.id,v_person,'worker',v_worker_per,n_worker);
  end loop;

  insert into public.audit_log(user_id,action,entity_type,entity_id,details)
  values(v_uid,'create','submission',v_submission.id::text,
    jsonb_build_object('work_date',p_work_date,'project',v_project.name,'section',v_section.name,'meters',p_meters));

  return jsonb_build_object(
    'ok',true,'id',v_submission.id,'total',v_total,'price_per_meter',v_section.price_per_meter,
    'tech_share_total',v_tech_total,'tech_share_per_person',v_tech_per,
    'assistant_share_total',v_assistant_total,'assistant_share_per_person',v_assistant_per,
    'worker_share_total',v_worker_total,'worker_share_per_person',v_worker_per
  );
end $$;

create or replace function public.set_active_cycle(p_month_key text)
returns table(month_key text,cycle_start date,cycle_end date)
language plpgsql security definer set search_path=''
as $$
declare v_month date; v_uid uuid:=auth.uid();
begin
  if v_uid is not null and not exists(select 1 from public.profiles where user_id=v_uid and app_role='admin') then
    raise exception 'Admin permission required';
  end if;
  perform * from public.cycle_bounds(p_month_key);
  v_month:=to_date(p_month_key||'-01','YYYY-MM-DD');
  update public.system_state set active_cycle_month=v_month where id=1;
  return query select p_month_key,b.cycle_start,b.cycle_end from public.cycle_bounds(p_month_key)b;
end $$;

create or replace function public.set_review_status(p_submission_id uuid,p_reviewed boolean)
returns public.review_status
language plpgsql security definer set search_path=''
as $$
declare v_status public.review_status; v_uid uuid:=auth.uid();
begin
  if v_uid is not null and not exists(select 1 from public.profiles where user_id=v_uid and app_role='admin') then
    raise exception 'Admin permission required';
  end if;
  v_status:=case when p_reviewed then 'reviewed'::public.review_status else 'not_reviewed'::public.review_status end;
  update public.submissions set review_status=v_status where id=p_submission_id;
  insert into public.audit_log(user_id,action,entity_type,entity_id,details)
  values(v_uid,'review_status','submission',p_submission_id::text,jsonb_build_object('status',v_status));
  return v_status;
end $$;

create or replace function public.upsert_absence_type(p_person_id uuid,p_date date,p_type public.absence_type)
returns void language plpgsql security definer set search_path=''
as $$
declare b record; v_uid uuid:=auth.uid();
begin
  if v_uid is not null and not exists(select 1 from public.profiles where user_id=v_uid and app_role='admin') then raise exception 'Admin permission required'; end if;
  select * into b from public.cycle_bounds(public.current_cycle_month_key(p_date));
  insert into public.attendance_absence_log(person_id,attendance_date,cycle_start,cycle_end,absence_type,updated_by)
  values(p_person_id,p_date,b.cycle_start,b.cycle_end,p_type,v_uid)
  on conflict(person_id,attendance_date) do update
  set absence_type=excluded.absence_type,cycle_start=excluded.cycle_start,cycle_end=excluded.cycle_end,updated_by=excluded.updated_by,updated_at=now();
end $$;

create or replace function public.upsert_attendance_note(p_person_id uuid,p_date date,p_note text)
returns void language plpgsql security definer set search_path=''
as $$
declare b record; v_uid uuid:=auth.uid();
begin
  if v_uid is not null and not exists(select 1 from public.profiles where user_id=v_uid and app_role='admin') then raise exception 'Admin permission required'; end if;
  select * into b from public.cycle_bounds(public.current_cycle_month_key(p_date));
  insert into public.attendance_notes(person_id,attendance_date,cycle_start,cycle_end,note,updated_by)
  values(p_person_id,p_date,b.cycle_start,b.cycle_end,coalesce(p_note,''),v_uid)
  on conflict(person_id,attendance_date) do update
  set note=excluded.note,cycle_start=excluded.cycle_start,cycle_end=excluded.cycle_end,updated_by=excluded.updated_by,updated_at=now();
end $$;

create or replace function public.attendance_for_cycle(p_month_key text default null)
returns table(person_id uuid,person_name text,role public.person_role,attendance_date date,status text,is_friday boolean,absence_type public.absence_type,note text)
language sql stable security invoker set search_path=''
as $$
with bounds as(select * from public.cycle_bounds(coalesce(p_month_key,public.active_cycle_month_key()))),
days as(select gs::date d from bounds b,generate_series(b.cycle_start,b.cycle_end,interval '1 day')gs),
active_people as(select id,name,role from public.people where active=true),
worked as(
  select distinct sp.person_id,s.work_date
  from public.submission_people sp join public.submissions s on s.id=sp.submission_id
  join bounds b on s.work_date between b.cycle_start and b.cycle_end
)
select p.id,p.name,p.role,d.d,
 case when d.d>current_date then 'upcoming'
      when extract(dow from d.d)=5 then 'present'
      when w.person_id is not null then 'present'
      else 'absent' end,
 extract(dow from d.d)=5,
 a.absence_type,n.note
from active_people p cross join days d
left join worked w on w.person_id=p.id and w.work_date=d.d
left join public.attendance_absence_log a on a.person_id=p.id and a.attendance_date=d.d
left join public.attendance_notes n on n.person_id=p.id and n.attendance_date=d.d
order by p.role,p.name,d.d
$$;

create or replace function public.person_cycle_stats(p_month_key text default null,p_role public.person_role default null)
returns table(person_id uuid,person_name text,role public.person_role,tasks bigint,meters numeric,earnings numeric,present_days bigint,absent_days bigint,upcoming_days bigint,pool_percent numeric)
language sql stable security invoker set search_path=''
as $$
with b as(select * from public.cycle_bounds(coalesce(p_month_key,public.active_cycle_month_key()))),
prod as(
 select p.id person_id,p.name person_name,p.role,
 count(s.id)::bigint tasks,coalesce(sum(s.meters),0)::numeric meters,coalesce(sum(sp.share_amount),0)::numeric earnings
 from public.people p
 left join public.submission_people sp on sp.person_id=p.id
 left join public.submissions s on s.id=sp.submission_id and s.work_date between(select cycle_start from b)and(select cycle_end from b)
 where p.active=true and(p_role is null or p.role=p_role)
 group by p.id,p.name,p.role
),
att as(
 select person_id,
 count(*)filter(where status='present')::bigint present_days,
 count(*)filter(where status='absent')::bigint absent_days,
 count(*)filter(where status='upcoming')::bigint upcoming_days
 from public.attendance_for_cycle(coalesce(p_month_key,public.active_cycle_month_key()))
 group by person_id
),x as(
 select prod.*,coalesce(att.present_days,0)present_days,coalesce(att.absent_days,0)absent_days,coalesce(att.upcoming_days,0)upcoming_days,
 sum(prod.earnings)over(partition by prod.role)role_pool
 from prod left join att using(person_id)
)
select person_id,person_name,role,tasks,public.round2(meters),public.round2(earnings),present_days,absent_days,upcoming_days,
case when role_pool>0 then public.round2(earnings/role_pool*100) else 0 end
from x order by role,earnings desc,person_name
$$;

create or replace function public.cycle_summary(p_month_key text default null)
returns table(tasks bigint,meters numeric,revenue numeric,avg_price numeric)
language sql stable security invoker set search_path=''
as $$
with b as(select * from public.cycle_bounds(coalesce(p_month_key,public.active_cycle_month_key()))),x as(
 select count(*)::bigint tasks,coalesce(sum(meters),0)::numeric meters,coalesce(sum(total),0)::numeric revenue
 from public.submissions where work_date between(select cycle_start from b)and(select cycle_end from b)
)
select tasks,public.round2(meters),public.round2(revenue),case when meters>0 then public.round2(revenue/meters) else 0 end from x
$$;

create or replace function public.dashboard_data(p_month_key text default null)
returns jsonb language sql stable security invoker set search_path=''
as $$
with mk as(select coalesce(p_month_key,public.active_cycle_month_key())m),
b as(select * from public.cycle_bounds((select m from mk))),
summary as(select * from public.cycle_summary((select m from mk))),
section_stats as(
 select s.section_name_snapshot name,count(*)tasks,public.round2(sum(s.meters))meters,public.round2(sum(s.total))revenue
 from public.submissions s,b where s.work_date between b.cycle_start and b.cycle_end
 group by s.section_name_snapshot order by revenue desc
),
project_stats as(
 select s.project_name_snapshot name,count(*)tasks,public.round2(sum(s.meters))meters,public.round2(sum(s.total))revenue
 from public.submissions s,b where s.work_date between b.cycle_start and b.cycle_end
 group by s.project_name_snapshot order by revenue desc
),
neglected as(
 select sec.name,sec.price_per_meter,count(sub.id)::bigint tasks,public.round2(coalesce(sum(sub.meters),0))meters,public.round2(coalesce(sum(sub.total),0))revenue
 from public.sections sec left join public.submissions sub on sub.section_id=sec.id and sub.work_date between(select cycle_start from b)and(select cycle_end from b)
 where sec.active=true group by sec.id,sec.name,sec.price_per_meter
 having count(sub.id)<=(select low_count_threshold from public.system_state where id=1)
 order by count(sub.id),sec.name
),
zero_rev as(
 select s.project_name_snapshot name,count(*)tasks,public.round2(sum(s.meters))meters,max(s.work_date)last_date,
 string_agg(distinct s.section_name_snapshot,'، ' order by s.section_name_snapshot)sections
 from public.submissions s,b where s.work_date between b.cycle_start and b.cycle_end and s.total=0
 group by s.project_name_snapshot order by count(*)desc,s.project_name_snapshot
),
project_sections as(
 select s.project_name_snapshot project,s.section_name_snapshot section,count(*)tasks,public.round2(sum(s.meters))meters
 from public.submissions s,b where s.work_date between b.cycle_start and b.cycle_end
 group by 1,2 order by 1,4 desc
),
people_stats as(select * from public.person_cycle_stats((select m from mk),null))
select jsonb_build_object(
 'month_key',(select m from mk),
 'cycle_start',(select cycle_start from b),
 'cycle_end',(select cycle_end from b),
 'summary',(select to_jsonb(summary)from summary),
 'previous_month_key',public.previous_cycle_month_key((select m from mk)),
 'previous_summary',(select to_jsonb(x)from public.cycle_summary(public.previous_cycle_month_key((select m from mk)))x),
 'technicians',(select coalesce(jsonb_agg(to_jsonb(ps)order by ps.earnings desc),'[]'::jsonb)from people_stats ps where role='technician'),
 'assistants',(select coalesce(jsonb_agg(to_jsonb(ps)order by ps.earnings desc),'[]'::jsonb)from people_stats ps where role='assistant'),
 'workers',(select coalesce(jsonb_agg(to_jsonb(ps)order by ps.earnings desc),'[]'::jsonb)from people_stats ps where role='worker'),
 'engineers',(select coalesce(jsonb_agg(to_jsonb(ps)order by ps.person_name),'[]'::jsonb)from people_stats ps where role='engineer'),
 'sections',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)from section_stats x),
 'projects',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)from project_stats x),
 'neglected_sections',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)from neglected x),
 'zero_revenue_projects',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)from zero_rev x),
 'project_sections',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)from project_sections x)
)
$$;

update public.system_state
set active_cycle_month=to_date(public.current_cycle_month_key(current_date)||'-01','YYYY-MM-DD')
where id=1;

