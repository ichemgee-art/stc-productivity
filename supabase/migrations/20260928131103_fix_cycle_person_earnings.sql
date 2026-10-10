
create or replace function public.person_cycle_stats(p_month_key text default null,p_role public.person_role default null)
returns table(
  person_id uuid,person_name text,role public.person_role,
  tasks bigint,meters numeric,earnings numeric,
  present_days bigint,absent_days bigint,upcoming_days bigint,pool_percent numeric
)
language sql stable security invoker set search_path=''
as $$
with b as(
  select * from public.cycle_bounds(coalesce(p_month_key,public.active_cycle_month_key()))
),
prod as(
 select p.id person_id,p.name person_name,p.role,
   count(s.id)::bigint tasks,
   coalesce(sum(case when s.id is not null then s.meters else 0 end),0)::numeric meters,
   coalesce(sum(case when s.id is not null then sp.share_amount else 0 end),0)::numeric earnings
 from public.people p
 left join public.submission_people sp on sp.person_id=p.id
 left join public.submissions s
   on s.id=sp.submission_id
  and s.work_date between (select cycle_start from b) and (select cycle_end from b)
 where p.active=true and (p_role is null or p.role=p_role)
 group by p.id,p.name,p.role
),
att as(
 select person_id,
   count(*) filter(where status='present')::bigint present_days,
   count(*) filter(where status='absent')::bigint absent_days,
   count(*) filter(where status='upcoming')::bigint upcoming_days
 from public.attendance_for_cycle(coalesce(p_month_key,public.active_cycle_month_key()))
 group by person_id
),
x as(
 select prod.*,
   coalesce(att.present_days,0) present_days,
   coalesce(att.absent_days,0) absent_days,
   coalesce(att.upcoming_days,0) upcoming_days,
   sum(prod.earnings) over(partition by prod.role) role_pool
 from prod left join att using(person_id)
)
select person_id,person_name,role,tasks,
       public.round2(meters),public.round2(earnings),
       present_days,absent_days,upcoming_days,
       case when role_pool>0 then public.round2(earnings/role_pool*100) else 0 end
from x
order by role,earnings desc,person_name
$$;

