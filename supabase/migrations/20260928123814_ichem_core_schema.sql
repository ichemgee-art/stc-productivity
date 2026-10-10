-- iChem Productivity System - Supabase/PostgreSQL schema
-- V1: normalized database while preserving the current Google Sheet logic.

create extension if not exists pgcrypto;

DO $$ BEGIN
  create type public.person_role as enum ('engineer','technician','assistant','worker');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create type public.review_status as enum ('not_reviewed','reviewed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create type public.absence_type as enum ('excused','unexcused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create type public.app_role as enum ('admin','viewer','data_entry');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  app_role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role public.person_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_name_not_blank check (length(btrim(name)) > 0),
  constraint people_name_role_unique unique (name, role)
);

create index if not exists people_role_active_idx on public.people(role, active);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_per_meter numeric(14,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint section_name_not_blank check (length(btrim(name)) > 0),
  constraint section_price_nonnegative check (price_per_meter >= 0)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_name_not_blank check (length(btrim(name)) > 0),
  constraint project_normalized_unique unique (normalized_name)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  work_date date not null,
  project_id uuid not null references public.projects(id),
  section_id uuid not null references public.sections(id),
  project_name_snapshot text not null,
  section_name_snapshot text not null,
  meters numeric(14,2) not null default 0,
  price_per_meter numeric(14,2) not null default 0,
  total numeric(16,2) not null default 0,
  tech_share_total numeric(16,2) not null default 0,
  tech_share_per_person numeric(16,2) not null default 0,
  assistant_share_total numeric(16,2) not null default 0,
  assistant_share_per_person numeric(16,2) not null default 0,
  worker_share_total numeric(16,2) not null default 0,
  worker_share_per_person numeric(16,2) not null default 0,
  review_status public.review_status not null default 'not_reviewed',
  price_missing boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  source text not null default 'web',
  legacy_source text,
  legacy_row_number integer,
  raw_legacy jsonb,
  updated_at timestamptz not null default now(),
  constraint submission_meters_nonnegative check (meters >= 0),
  constraint submission_price_nonnegative check (price_per_meter >= 0),
  constraint submission_legacy_unique unique (legacy_source, legacy_row_number)
);

create index if not exists submissions_work_date_idx on public.submissions(work_date desc);
create index if not exists submissions_project_idx on public.submissions(project_id, work_date desc);
create index if not exists submissions_section_idx on public.submissions(section_id, work_date desc);
create index if not exists submissions_review_idx on public.submissions(review_status, work_date desc);

create table if not exists public.submission_people (
  submission_id uuid not null references public.submissions(id) on delete cascade,
  person_id uuid not null references public.people(id),
  role public.person_role not null,
  share_amount numeric(16,2) not null default 0,
  group_size integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (submission_id, person_id),
  constraint submission_people_group_size_positive check (group_size >= 1),
  constraint submission_people_share_nonnegative check (share_amount >= 0)
);

create index if not exists submission_people_person_idx on public.submission_people(person_id, submission_id);
create index if not exists submission_people_role_idx on public.submission_people(role, submission_id);

create table if not exists public.attendance_absence_log (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  attendance_date date not null,
  cycle_start date not null,
  cycle_end date not null,
  absence_type public.absence_type,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(person_id, attendance_date)
);

create index if not exists attendance_absence_person_date_idx
  on public.attendance_absence_log(person_id, attendance_date desc);

create table if not exists public.attendance_notes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  attendance_date date not null,
  cycle_start date not null,
  cycle_end date not null,
  note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(person_id, attendance_date)
);

create index if not exists attendance_notes_person_date_idx
  on public.attendance_notes(person_id, attendance_date desc);

create table if not exists public.system_state (
  id smallint primary key default 1 check (id = 1),
  active_cycle_month date not null default date_trunc('month', current_date)::date,
  tech_share numeric(6,4) not null default 0.70,
  assistant_share numeric(6,4) not null default 0.30,
  worker_rate_per_meter numeric(14,2) not null default 10,
  low_count_threshold integer not null default 2,
  updated_at timestamptz not null default now(),
  constraint shares_valid check (tech_share >= 0 and assistant_share >= 0 and tech_share + assistant_share = 1),
  constraint worker_rate_nonnegative check (worker_rate_per_meter >= 0)
);

insert into public.system_state(id) values (1) on conflict (id) do nothing;

create table if not exists public.audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_time_idx on public.audit_log(occurred_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','people','sections','projects','submissions','system_state'] LOOP
    EXECUTE format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
    EXECUTE format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  END LOOP;
END $$;
