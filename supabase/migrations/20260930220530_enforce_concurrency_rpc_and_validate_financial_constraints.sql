
revoke execute on function public.update_productivity_submission(
  uuid,date,text,text,numeric,uuid[],uuid[],uuid[],uuid[]
) from authenticated;

grant execute on function public.update_productivity_submission(
  uuid,date,text,text,numeric,uuid[],uuid[],uuid[],uuid[]
) to service_role;

alter table public.submissions validate constraint submission_total_nonnegative;
alter table public.submissions validate constraint submission_total_matches_price;
alter table public.system_state validate constraint low_count_threshold_nonnegative;

