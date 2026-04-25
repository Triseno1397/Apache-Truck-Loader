# Apache Truck Loader

Web app for Apache Rental Group's crew to plan gear loads for 26ft Penske box trucks and 53ft semis. Vendors send gear specs in any format; the app canonicalizes everything to linear feet and shows real-time capacity utilization.

Built by Triseno Systems. Deployed at `load.apacherentalgroup.com`.

- **Project instructions:** [CLAUDE.md](CLAUDE.md)
- **Full spec:** [docs/apache-truck-loader-spec.md](docs/apache-truck-loader-spec.md)
- **Working prototype reference:** [docs/truck-load-planner.jsx](docs/truck-load-planner.jsx)

## Stack

Next.js 16 (App Router) - TypeScript strict - Tailwind CSS v4 - Supabase (Postgres + Auth + RLS) - Vercel.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in Supabase keys (see below)
npm run dev
```

Open <http://localhost:3000>.

## Setting up the Supabase database (first time)

The full schema (tables, enums, indexes, row-level-security policies, the new-user trigger, and the seeded case library) lives in a single SQL file: [supabase/migrations/0001_initial.sql](supabase/migrations/0001_initial.sql). Apply it once via the Supabase dashboard.

### 1. Open the SQL Editor

1. Go to <https://supabase.com/dashboard> and open the **Apache Truck Loader** project.
2. In the left sidebar, click the **SQL Editor** icon (looks like `>_`).
3. Click **+ New query** in the top-left.

### 2. Paste and run the migration

1. Open `supabase/migrations/0001_initial.sql` in your editor and copy the entire file.
2. Paste it into the SQL Editor query window.
3. Click **Run** (bottom-right) or press `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac).
4. You should see a green **"Success. No rows returned"** message at the bottom. If you see an error, copy it and share — don't re-run the file blindly. (The migration is mostly idempotent but the `create table` statements will fail on a re-run; in that case, drop the public schema first.)

### 3. Verify it worked

1. In the left sidebar, click **Table Editor** (looks like a small grid icon).
2. You should see seven new tables under the `public` schema:
   `case_library`, `custom_trucks`, `job_snapshots`, `jobs`, `profiles`, `vendor_self_reports`, `vendors`.
3. Click `case_library`. You should see **15 rows** seeded — Pelican 1510 through "Custom / unknown" — all with `is_global = true`.

### 4. Get your API keys

1. Still in the dashboard, click the gear (⚙) icon at the bottom of the left sidebar -> **API Keys**.
2. You'll see two keys under the **API Keys** section:
   - **Publishable key** — starts with `sb_publishable_...`. Safe to expose to the browser.
   - **Secret key** — starts with `sb_secret_...`. Server-only; full admin access. Treat like a password.
3. Above the keys, copy your **Project URL** (`https://kslywdsbvruorununbjp.supabase.co`).

### 5. Wire up `.env.local`

In the project root, create a file called `.env.local` (it's gitignored — never commit it). Paste:

```
NEXT_PUBLIC_SUPABASE_URL=https://kslywdsbvruorununbjp.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # paste yours
SUPABASE_SECRET_KEY=sb_secret_...                          # paste yours
```

Restart `npm run dev` if it's already running so the new env vars are picked up.

## Database migrations going forward

New schema changes get a new file in `supabase/migrations/` (e.g. `0002_add_xxx.sql`) and are applied the same way: paste into the SQL Editor and run. We're not using the Supabase CLI's automated migration system yet — keeps the workflow zero-tooling for now.
