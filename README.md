# iChem Productivity — React V3

React + Vite frontend for the existing iChem Productivity Supabase backend.

## Roles

- **Admin** (`admin`): full management of submissions, review/delete/edit, attendance, people, projects, sections, and active cycle.
- **User** (`data_entry`): view operational data and create new productivity submissions.
- **Viewer** (`viewer`): read-only fallback for legacy accounts.

UI visibility is not the security boundary. Supabase RLS/RPC authorization remains authoritative.

## Stack

- React 19
- Vite 8
- Supabase JS
- React Router
- TanStack Query
- Recharts
- Lucide React

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_ACCOUNT_REQUEST_URL=https://YOUR_INTERNAL_REQUEST_URL
```

`VITE_ACCOUNT_REQUEST_URL` controls the public “request access” CTA. It may point to an internal request page or a configured `mailto:` link. Do not commit personal or sensitive email addresses. If the variable is omitted, the UI opens a recipient-less `mailto:` draft whose body contains the documented `[SUPPORT_EMAIL]` placeholder rather than exposing a real address.

## Vercel

This repository includes `vercel.json` for Vite SPA routing.

In Vercel:

1. Import the GitHub repository.
2. Framework preset: **Vite**.
3. Add the two Supabase environment variables.
4. Deploy. Build command and output directory are already configured.

## Historical cycles

The cycle selector reads `public.v_available_cycles`, which derives available 26→25 cycles from productivity, absence, and note records. Changing the selected cycle updates dashboard, productivity, people statistics, attendance, and cycle-based section metrics.

## Legacy frontend

The original single-file implementation remains under `ichem/index.html` on the repository and is intentionally kept as a rollback/reference version during migration.


## Pre-login visual tour

The public login experience includes a demo-only visual tour. It must never contain production screenshots or real operational data.

Current placeholder assets live in:

- `public/tour/dashboard.svg`
- `public/tour/teams-attendance.svg`
- `public/tour/projects-sectors.svg`
- `public/tour/reports.svg`

These SVGs contain fictional names, projects, values, and a “بيانات توضيحية” watermark.

### Replacing placeholders with real product imagery

1. Capture the product only in a safe demo environment.
2. Replace every person name, project name, amount, email, phone number, and note with fictional values.
3. Blur any remaining potentially identifying information.
4. Add a visible “بيانات توضيحية” watermark.
5. Export as WebP or AVIF with a fixed aspect ratio close to 1200×760.
6. Put the optimized files under `public/tour/`.
7. Update the image paths in `src/components/prelogin/VisualTour.jsx` while keeping descriptive Arabic alt text.
8. Do not add a tour video unless it is captioned or silent, user-initiated, and ships with a poster image.

The tour lightbox is keyboard accessible: it traps focus, closes with Escape or backdrop click, and restores focus to the card that opened it.


## Supabase Data API grants

Supabase stops auto-exposing newly created `public` tables to the Data API for existing projects on **2026-10-30**. This repository intentionally uses explicit Postgres grants.

For every future migration that creates a table in `public`, treat these as one change:

1. Create the table.
2. Add the minimum explicit `GRANT`s needed by `anon`, `authenticated`, and/or `service_role`.
3. Enable RLS.
4. Add the required RLS policies.
5. If the table uses an identity/serial sequence, grant sequence privileges only to roles that legitimately insert.

Do not rely on default privileges. In this application, browser users normally have table `SELECT` access only; writes are performed through controlled RPCs. Never grant `anon` access unless the feature explicitly requires public access.

Example:

```sql
create table public.example (...);

grant select on public.example to authenticated;
grant all privileges on public.example to service_role;

alter table public.example enable row level security;

-- Add the least-privilege policies required by the feature.
```

The migration `20261021062737_data_api_explicit_grants_20261021.sql` adopts the post-October-30 behavior for future objects created by `postgres` and preserves the current grants on existing application tables.
