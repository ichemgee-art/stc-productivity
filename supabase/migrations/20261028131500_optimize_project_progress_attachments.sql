-- Optimize project progress attachment lookups and RLS evaluation — 2026-10-28

create index project_progress_attachments_progress_idx
on public.project_progress_attachments(project_progress_id);

create index project_progress_attachments_created_by_idx
on public.project_progress_attachments(created_by);

drop policy "Admin can insert project progress attachments"
on public.project_progress_attachments;

create policy "Admin can insert project progress attachments"
on public.project_progress_attachments
for insert
to authenticated
with check (
  private.current_app_role() = 'admin'::public.app_role
  and created_by = (select auth.uid())
);
