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

`VITE_ACCOUNT_REQUEST_URL` controls the public “request access” CTA. It may point to an internal request page or a configured `mailto:` link. Do not commit personal or sensitive email addresses. If the variable is omitted, the UI falls back to a documented `[SUPPORT_EMAIL]` placeholder rather than exposing a real address.

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
