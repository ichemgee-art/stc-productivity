
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.cycle_bounds(text) to authenticated;
grant execute on function public.current_cycle_month_key(date) to authenticated;
grant execute on function public.active_cycle_month_key() to authenticated;
grant execute on function public.previous_cycle_month_key(text) to authenticated;
grant execute on function public.attendance_for_cycle(text) to authenticated;
grant execute on function public.person_cycle_stats(text,public.person_role) to authenticated;
grant execute on function public.cycle_summary(text) to authenticated;
grant execute on function public.dashboard_data(text) to authenticated;
grant execute on function public.create_productivity_submission(date,text,text,numeric,uuid[],uuid[],uuid[],uuid[],text) to authenticated;
grant execute on function public.set_active_cycle(text) to authenticated;
grant execute on function public.set_review_status(uuid,boolean) to authenticated;
grant execute on function public.upsert_absence_type(uuid,date,public.absence_type) to authenticated;
grant execute on function public.upsert_attendance_note(uuid,date,text) to authenticated;

