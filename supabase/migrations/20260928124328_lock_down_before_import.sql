
revoke all on table public.profiles, public.people, public.sections, public.projects,
 public.submissions, public.submission_people, public.attendance_absence_log,
 public.attendance_notes, public.system_state, public.audit_log
from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

