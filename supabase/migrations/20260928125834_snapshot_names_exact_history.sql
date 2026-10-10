
alter table public.submissions
  add column if not exists engineer_names_snapshot text not null default '',
  add column if not exists technician_names_snapshot text not null default '',
  add column if not exists assistant_names_snapshot text not null default '',
  add column if not exists worker_names_snapshot text not null default '';

create or replace function public.names_for_ids(p_ids uuid[])
returns text
language sql
stable
security invoker
set search_path=''
as $$
  select coalesce(string_agg(p.name,'، ' order by array_position(p_ids,p.id)),'')
  from public.people p
  where p.id=any(coalesce(p_ids,'{}'::uuid[]))
$$;

drop view if exists public.v_master_data_ar;
drop view if exists public.v_master_data;

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
  ) then raise exception 'غير مسموح لك بتسجيل الإنتاجية'; end if;

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
  elsif n_tech>0 then v_tech_total:=v_total;
  elsif n_assist>0 then v_assistant_total:=v_total;
  end if;

  if n_tech>0 then v_tech_per:=public.round2(v_tech_total/n_tech); end if;
  if n_assist>0 then v_assistant_per:=public.round2(v_assistant_total/n_assist); end if;
  if n_worker>0 then
    v_worker_total:=public.round2(p_meters*v_state.worker_rate_per_meter);
    v_worker_per:=public.round2(v_worker_total/n_worker);
  end if;

  insert into public.submissions(
    work_date,project_id,section_id,project_name_snapshot,section_name_snapshot,
    engineer_names_snapshot,technician_names_snapshot,assistant_names_snapshot,worker_names_snapshot,
    meters,price_per_meter,total,
    tech_share_total,tech_share_per_person,assistant_share_total,assistant_share_per_person,
    worker_share_total,worker_share_per_person,
    technician_count_snapshot,assistant_count_snapshot,worker_count_snapshot,
    review_status,price_missing,created_by,source
  ) values(
    p_work_date,v_project.id,v_section.id,v_project.name,v_section.name,
    public.names_for_ids(p_engineer_ids),public.names_for_ids(p_technician_ids),
    public.names_for_ids(p_assistant_ids),public.names_for_ids(p_worker_ids),
    public.round2(p_meters),v_section.price_per_meter,v_total,
    v_tech_total,v_tech_per,v_assistant_total,v_assistant_per,v_worker_total,v_worker_per,
    n_tech,n_assist,n_worker,'not_reviewed',false,v_uid,coalesce(nullif(p_source,''),'web')
  ) returning * into v_submission;

  foreach v_person in array p_engineer_ids loop
    insert into public.submission_people(submission_id,person_id,role,share_amount,group_size)
    values(v_submission.id,v_person,'engineer',0,greatest(n_eng,1));
  end loop;
  foreach v_person in array p_technician_ids loop
    insert into public.submission_people(submission_id,person_id,role,share_amount,group_size)
    values(v_submission.id,v_person,'technician',v_tech_per,greatest(n_tech,1));
  end loop;
  foreach v_person in array p_assistant_ids loop
    insert into public.submission_people(submission_id,person_id,role,share_amount,group_size)
    values(v_submission.id,v_person,'assistant',v_assistant_per,greatest(n_assist,1));
  end loop;
  foreach v_person in array p_worker_ids loop
    insert into public.submission_people(submission_id,person_id,role,share_amount,group_size)
    values(v_submission.id,v_person,'worker',v_worker_per,greatest(n_worker,1));
  end loop;

  insert into public.audit_log(user_id,action,entity_type,entity_id,details)
  values(v_uid,'create','submission',v_submission.id::text,
    jsonb_build_object('work_date',p_work_date,'project',v_project.name,'section',v_section.name,'meters',p_meters));

  return jsonb_build_object('ok',true,'id',v_submission.id,'total',v_total,'price_per_meter',v_section.price_per_meter);
end $$;

create view public.v_master_data
with (security_invoker=true)
as
select
  s.id,s.submitted_at,s.work_date,
  s.engineer_names_snapshot engineers,
  s.technician_names_snapshot technicians,
  s.technician_count_snapshot::bigint technician_count,
  s.assistant_names_snapshot assistants,
  s.assistant_count_snapshot::bigint assistant_count,
  s.project_name_snapshot project,s.section_name_snapshot section,
  s.meters,s.price_per_meter,s.total,
  s.tech_share_total,s.tech_share_per_person,
  s.assistant_share_total,s.assistant_share_per_person,
  s.worker_names_snapshot workers,
  s.worker_count_snapshot::bigint worker_count,
  s.worker_share_total,s.worker_share_per_person,
  s.review_status,public.review_status_ar(s.review_status) review_status_ar,
  s.price_missing,s.source
from public.submissions s;

create view public.v_master_data_ar
with (security_invoker=true)
as
select
  submitted_at as "وقت الإرسال",work_date as "التاريخ",engineers as "المهندس",
  technicians as "الفنيين المشاركين",technician_count as "عدد الفنيين",
  assistants as "مساعدين الممتاز المشاركين",assistant_count as "عدد المساعدين",
  project as "المشروع",section as "القطاع",meters as "عدد الأمتار",
  price_per_meter as "سعر المتر",total as "الإجمالي",
  tech_share_total as "إجمالي نصيب الفنيين",tech_share_per_person as "نصيب كل فني",
  assistant_share_total as "إجمالي نصيب المساعدين",assistant_share_per_person as "نصيب كل مساعد",
  workers as "العمال المشاركين",worker_count as "عدد العمال",
  worker_share_total as "إجمالي نصيب العمال",worker_share_per_person as "نصيب كل عامل",
  review_status_ar as "حالة المراجعة"
from public.v_master_data;

grant select on public.v_master_data,public.v_master_data_ar to authenticated;
grant execute on function public.create_productivity_submission(date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],text) to authenticated;

