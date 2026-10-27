-- Ensure productivity and project follow-up always share one canonical project identity.
-- Linked follow-up quantities are all-time SUM(submissions.meters) by project_id.

do $$
declare
  rec record;
  pid uuid;
  existing_pid uuid;
begin
  for rec in
    select * from (values
      ('انفينتي'::text,'إنفينيتي'::text),
      ('جامعه مصر'::text,'جامعة مصر'::text),
      ('اسمنت العامرية'::text,'أسمنت العامرية'::text)
    ) as v(alias_name,canonical_name)
  loop
    select id into pid
    from public.projects
    where normalized_name=lower(btrim(regexp_replace(rec.canonical_name,'\s+',' ','g')))
    limit 1;

    if pid is null then
      raise exception 'Canonical project missing for alias %',rec.alias_name;
    end if;

    insert into public.project_aliases(alias,project_id)
    values(rec.alias_name,pid)
    on conflict(normalized_name) do nothing;

    select project_id into existing_pid
    from public.project_aliases
    where normalized_name=lower(btrim(regexp_replace(rec.alias_name,'\s+',' ','g')));

    if existing_pid is distinct from pid then
      raise exception 'Alias % points to the wrong project',rec.alias_name;
    end if;
  end loop;
end $$;

create or replace function public.resolve_project_input_name(p_name text)
returns text
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_clean text := btrim(regexp_replace(coalesce(p_name,''),'\s+',' ','g'));
  v_name text;
begin
  if v_clean='' then return v_clean; end if;

  select p.name into v_name
  from public.project_aliases a
  join public.projects p on p.id=a.project_id
  where a.normalized_name=lower(v_clean)
  limit 1;
  if found then return v_name; end if;

  select p.name into v_name
  from public.projects p
  where p.normalized_name=lower(v_clean)
  limit 1;
  if found then return v_name; end if;

  return v_clean;
end
$$;

revoke all on function public.resolve_project_input_name(text) from public,anon;
grant execute on function public.resolve_project_input_name(text) to authenticated,service_role;

create or replace function public.create_productivity_submission(
  p_work_date date,
  p_project_name text,
  p_section_name text,
  p_meters numeric,
  p_engineer_ids uuid[] default '{}',
  p_technician_ids uuid[] default '{}',
  p_assistant_ids uuid[] default '{}',
  p_worker_ids uuid[] default '{}',
  p_source text default 'web'
)
returns jsonb
language sql
set search_path=''
as $$
  select private.create_productivity_submission(
    p_work_date,public.resolve_project_input_name(p_project_name),p_section_name,p_meters,
    p_engineer_ids,p_technician_ids,p_assistant_ids,p_worker_ids,p_source
  );
$$;

create or replace function public.create_productivity_submission(
  p_work_date date,
  p_project_name text,
  p_section_name text,
  p_meters numeric,
  p_engineer_ids uuid[],
  p_technician_ids uuid[],
  p_assistant_ids uuid[],
  p_worker_ids uuid[],
  p_source text,
  p_client_request_id uuid
)
returns jsonb
language sql
set search_path=''
as $$
  select private.create_productivity_submission(
    p_work_date,public.resolve_project_input_name(p_project_name),p_section_name,p_meters,
    p_engineer_ids,p_technician_ids,p_assistant_ids,p_worker_ids,p_source,p_client_request_id
  );
$$;

create or replace function public.update_productivity_submission(
  p_submission_id uuid,
  p_work_date date,
  p_project_name text,
  p_section_name text,
  p_meters numeric,
  p_engineer_ids uuid[] default '{}',
  p_technician_ids uuid[] default '{}',
  p_assistant_ids uuid[] default '{}',
  p_worker_ids uuid[] default '{}'
)
returns jsonb
language sql
set search_path=''
as $$
  select private.update_productivity_submission(
    p_submission_id,p_work_date,public.resolve_project_input_name(p_project_name),p_section_name,p_meters,
    p_engineer_ids,p_technician_ids,p_assistant_ids,p_worker_ids
  );
$$;

create or replace function public.update_productivity_submission(
  p_submission_id uuid,
  p_work_date date,
  p_project_name text,
  p_section_name text,
  p_meters numeric,
  p_engineer_ids uuid[],
  p_technician_ids uuid[],
  p_assistant_ids uuid[],
  p_worker_ids uuid[],
  p_expected_updated_at timestamptz
)
returns jsonb
language sql
set search_path=''
as $$
  select private.update_productivity_submission(
    p_submission_id,p_work_date,public.resolve_project_input_name(p_project_name),p_section_name,p_meters,
    p_engineer_ids,p_technician_ids,p_assistant_ids,p_worker_ids,p_expected_updated_at
  );
$$;

create or replace function private.enforce_project_name_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_clean text;
  v_canonical_name text;
begin
  v_clean := btrim(regexp_replace(coalesce(new.name,''), '\s+', ' ', 'g'));
  if v_clean = '' then
    raise exception 'اسم المشروع مطلوب';
  end if;

  select a.canonical_name into v_canonical_name
  from private.project_name_aliases a
  where a.alias_key=private.project_alias_key(v_clean)
  limit 1;
  if found then
    raise exception 'اسم المشروع ده مسجل بالفعل باسم "%"', v_canonical_name;
  end if;

  select p.name into v_canonical_name
  from public.project_aliases a
  join public.projects p on p.id=a.project_id
  where a.normalized_name=private.project_alias_key(v_clean)
  limit 1;
  if found then
    raise exception 'اسم المشروع ده مسجل بالفعل باسم "%"', v_canonical_name;
  end if;

  new.name := v_clean;
  return new;
end
$$;

create unique index if not exists project_progress_one_linked_project_idx
on public.project_progress_records(project_id)
where execution_mode='linked' and project_id is not null;

create or replace function private.guard_single_linked_project_progress()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.execution_mode='linked' and new.project_id is not null
     and exists(
       select 1
       from public.project_progress_records r
       where r.execution_mode='linked'
         and r.project_id=new.project_id
         and r.id<>new.id
     )
  then
    raise exception 'المشروع موجود بالفعل في متابعة المشاريع';
  end if;
  return new;
end
$$;

revoke all on function private.guard_single_linked_project_progress() from public,anon,authenticated;

drop trigger if exists guard_single_linked_project_progress on public.project_progress_records;
create trigger guard_single_linked_project_progress
before insert or update of project_id,execution_mode
on public.project_progress_records
for each row execute function private.guard_single_linked_project_progress();

notify pgrst,'reload schema';
