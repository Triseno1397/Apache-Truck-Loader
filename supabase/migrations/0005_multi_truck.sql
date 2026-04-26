-- Multi-truck per job. A single job can have N trucks (default 1), each
-- packed independently. Vendors are assigned to a specific truck.
--
-- Migration plan:
--   1. Create public.job_trucks (one row per truck on a job).
--   2. Backfill: every existing job becomes a job_trucks row preserving
--      its current truck_type / custom_truck_id / buffer_pct.
--   3. Add vendors.job_truck_id (nullable while we backfill).
--   4. Backfill: every vendor adopts its job's only truck.
--   5. Make vendors.job_truck_id NOT NULL.
--   6. Drop jobs.truck_type, jobs.custom_truck_id, jobs.buffer_pct -
--      those concerns now live on job_trucks. (No backwards-compat
--      shims kept; per CLAUDE.md.)
--
-- Idempotent: each step guards against being re-run.
-- ============================================================

-- 1. job_trucks table -----------------------------------------------------
create table if not exists public.job_trucks (
  id              uuid primary key default uuid_generate_v4(),
  job_id          uuid not null references public.jobs(id) on delete cascade,
  truck_type      public.truck_type not null default '26ft_penske',
  custom_truck_id uuid references public.custom_trucks(id) on delete set null,
  label           text,
  buffer_pct      int not null default 10 check (buffer_pct between 0 and 100),
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  constraint job_trucks_custom_truck_consistency check (
    (truck_type = 'custom' and custom_truck_id is not null)
    or (truck_type <> 'custom' and custom_truck_id is null)
  )
);

create index if not exists job_trucks_job_id_idx
  on public.job_trucks (job_id, sort_order);

alter table public.job_trucks enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'job_trucks' and policyname = 'job_trucks_all'
  ) then
    create policy job_trucks_all on public.job_trucks
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- 2. Backfill one job_trucks row per existing job -------------------------
-- Only run for jobs that don't yet have any trucks (idempotent).
insert into public.job_trucks (job_id, truck_type, custom_truck_id, buffer_pct, sort_order)
select
  j.id,
  -- jobs.truck_type may already be dropped on a re-run; coalesce defensively.
  coalesce(j.truck_type, '26ft_penske'::public.truck_type),
  case when j.truck_type = 'custom' then j.custom_truck_id else null end,
  coalesce(j.buffer_pct, 10),
  0
from public.jobs j
where not exists (
  select 1 from public.job_trucks jt where jt.job_id = j.id
);

-- 3. vendors.job_truck_id (nullable for backfill) -------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'job_truck_id'
  ) then
    alter table public.vendors
      add column job_truck_id uuid references public.job_trucks(id) on delete cascade;
  end if;
end $$;

create index if not exists vendors_job_truck_id_idx
  on public.vendors (job_truck_id);

-- 4. Backfill vendors -> their job's primary (lowest sort_order) truck ----
update public.vendors v
set job_truck_id = jt.id
from (
  select distinct on (job_id) id, job_id
  from public.job_trucks
  order by job_id, sort_order, created_at
) jt
where v.job_id = jt.job_id and v.job_truck_id is null;

-- 5. NOT NULL on vendors.job_truck_id (only if no nulls remain) -----------
do $$ begin
  if not exists (select 1 from public.vendors where job_truck_id is null) then
    alter table public.vendors alter column job_truck_id set not null;
  end if;
end $$;

-- 6. Drop the now-redundant jobs columns ----------------------------------
-- The check constraint references the columns; drop it first.
do $$ begin
  if exists (
    select 1 from pg_constraint
    where conname = 'jobs_custom_truck_consistency' and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs drop constraint jobs_custom_truck_consistency;
  end if;
end $$;

alter table public.jobs drop column if exists truck_type;
alter table public.jobs drop column if exists custom_truck_id;
alter table public.jobs drop column if exists buffer_pct;
