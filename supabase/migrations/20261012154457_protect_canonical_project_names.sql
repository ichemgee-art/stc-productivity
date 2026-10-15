create or replace function private.project_alias_key(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(btrim(regexp_replace(coalesce(p_name,''), '\\s+', ' ', 'g')))
$$;

create or replace function private.project_name_key(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
           translate(
             lower(btrim(regexp_replace(coalesce(p_name,''), '\\s+', ' ', 'g'))),
             'أإآٱىةؤئـ',
             'اااايهوي'
           ),
           '[ًٌٍَُِّْ\\s]+',
           '',
           'g'
         )
$$;

create table if not exists private.project_name_aliases (
  alias_key text primary key,
  alias_name text not null,
  canonical_name text not null,
  created_at timestamptz not null default now()
);

revoke all on private.project_name_aliases from public, anon, authenticated;

insert into private.project_name_aliases(alias_key, alias_name, canonical_name)
values
  (private.project_alias_key('انفينتي'), 'انفينتي', 'إنفينيتي'),
  (private.project_alias_key('جامعه مصر'), 'جامعه مصر', 'جامعة مصر'),
  (private.project_alias_key('اسمنت العامرية'), 'اسمنت العامرية', 'أسمنت العامرية')
on conflict (alias_key) do update
set alias_name=excluded.alias_name,
    canonical_name=excluded.canonical_name;

create unique index if not exists projects_business_name_unique
on public.projects (private.project_name_key(name));

create or replace function private.enforce_project_name_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean text;
  v_canonical_name text;
begin
  v_clean := btrim(regexp_replace(coalesce(new.name,''), '\\s+', ' ', 'g'));
  if v_clean = '' then
    raise exception 'اسم المشروع مطلوب';
  end if;

  select a.canonical_name
    into v_canonical_name
  from private.project_name_aliases a
  where a.alias_key=private.project_alias_key(v_clean)
  limit 1;

  if found then
    raise exception 'اسم المشروع ده مسجل بالفعل باسم "%"', v_canonical_name;
  end if;

  new.name := v_clean;
  return new;
end
$$;

drop trigger if exists projects_name_identity_guard on public.projects;
create trigger projects_name_identity_guard
before insert or update of name on public.projects
for each row execute function private.enforce_project_name_identity();

create or replace function public.admin_save_project(p_id uuid, p_name text, p_active boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_id uuid;
  v_old public.projects;
  v_new public.projects;
  v_clean text;
  v_existing public.projects;
  v_canonical_name text;
begin
  if v_uid is null or not exists(
    select 1 from public.profiles where user_id=v_uid and app_role='admin'
  ) then
    raise exception 'صلاحية Admin مطلوبة';
  end if;

  v_clean:=btrim(regexp_replace(coalesce(p_name,''),'\\s+',' ','g'));
  if v_clean='' then raise exception 'اسم المشروع مطلوب'; end if;

  select a.canonical_name
  into v_canonical_name
  from private.project_name_aliases a
  where a.alias_key=private.project_alias_key(v_clean)
  limit 1;

  if found then
    raise exception 'اسم المشروع ده مسجل بالفعل باسم "%"', v_canonical_name;
  end if;

  select p.*
  into v_existing
  from public.projects p
  where private.project_name_key(p.name)=private.project_name_key(v_clean)
    and (p_id is null or p.id<>p_id)
  limit 1;

  if found then
    raise exception 'اسم المشروع ده مسجل بالفعل باسم "%"', v_existing.name;
  end if;

  if p_id is null then
    insert into public.projects(name,active)
    values(v_clean,coalesce(p_active,true))
    returning * into v_new;
    v_id:=v_new.id;

    insert into public.audit_log(user_id,action,entity_type,entity_id,details)
    values(v_uid,'create','project',v_id::text,
      jsonb_build_object('after',to_jsonb(v_new),'reversible',false));
  else
    select * into v_old from public.projects where id=p_id;
    if not found then raise exception 'المشروع غير موجود'; end if;

    update public.projects
    set name=v_clean,active=coalesce(p_active,true),updated_at=now()
    where id=p_id
    returning * into v_new;

    v_id:=v_new.id;
    insert into public.audit_log(user_id,action,entity_type,entity_id,details)
    values(v_uid,'update','project',v_id::text,
      jsonb_build_object('before',to_jsonb(v_old),'after',to_jsonb(v_new),'reversible',false));
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'اسم المشروع موجود بالفعل';
end
$$;

insert into public.audit_log(action,entity_type,entity_id,details)
values(
  'project_name_protection_enabled',
  'project',
  null,
  jsonb_build_object(
    'reason','prevent_duplicate_project_names',
    'protected_aliases',jsonb_build_array('انفينتي','جامعه مصر','اسمنت العامرية'),
    'canonical_names',jsonb_build_array('إنفينيتي','جامعة مصر','أسمنت العامرية')
  )
);
