-- Raise project progress attachment limit to five — 2026-10-28

create or replace function private.enforce_project_progress_attachment_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.project_progress_attachments
    where project_progress_id = new.project_progress_id
  ) >= 5 then
    raise exception 'الحد الأقصى 5 مرفقات لكل متابعة مشروع';
  end if;
  return new;
end;
$$;
