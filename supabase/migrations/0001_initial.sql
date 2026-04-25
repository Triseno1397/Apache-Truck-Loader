-- ============================================================
-- Apache Truck Loader: initial schema, RLS, triggers, seed.
-- Apply via Supabase SQL Editor in one paste.
--
-- Idempotent: safe to re-run; uses `if not exists`/`on conflict do nothing`
-- where it makes sense, but the table CREATEs are not guarded - drop the
-- public schema first if you need a clean reset.
-- ============================================================

-- ----- extensions --------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ----- enums -------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin', 'crew');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.truck_type as enum ('26ft_penske', '53ft_semi', 'custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_status as enum ('draft', 'confirmed', 'loaded', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.input_method as enum ('linear', 'dimensions', 'pieces', 'cubic', 'footprint', 'pallets', 'image');
exception when duplicate_object then null; end $$;

-- ----- shared helpers ----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- profiles  (extends auth.users)
-- ============================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  role          public.user_role not null default 'crew',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- security definer so policies can ask "is the current user an admin?"
-- without recursing into the profiles RLS policy itself.
-- Defined after the profiles table so Postgres' SQL-function body check passes.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = (select auth.uid())),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Block role escalation: only admins can change the role column.
create or replace function public.guard_profile_role_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role and not public.is_admin() then
    raise exception 'Only admins can change a user role';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role_update
  before update on public.profiles
  for each row execute function public.guard_profile_role_update();

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy profiles_update_self on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.is_admin());
-- No DELETE policy => blocked by RLS.

-- Auto-create a profile when a new auth.users row appears.
-- Runs as SECURITY DEFINER so it can bypass RLS on profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'crew'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- custom_trucks
-- ============================================================
create table public.custom_trucks (
  id                  uuid primary key default uuid_generate_v4(),
  label               text not null,
  interior_length_ft  numeric(6,2) not null check (interior_length_ft > 0),
  interior_width_ft   numeric(6,2) not null check (interior_width_ft > 0),
  interior_height_ft  numeric(6,2) not null check (interior_height_ft > 0),
  cubic_feet          numeric(10,2) generated always as
    (interior_length_ft * interior_width_ft * interior_height_ft) stored,
  cargo_weight_lb     numeric(8,1) not null check (cargo_weight_lb > 0),
  has_liftgate        boolean not null default false,
  liftgate_lb         numeric(8,1),
  created_at          timestamptz not null default now()
);

alter table public.custom_trucks enable row level security;

create policy custom_trucks_all on public.custom_trucks
  for all to authenticated using (true) with check (true);

-- ============================================================
-- jobs
-- ============================================================
create table public.jobs (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  client          text,
  event_date      date,
  truck_type      public.truck_type not null default '26ft_penske',
  custom_truck_id uuid references public.custom_trucks(id) on delete set null,
  status          public.job_status not null default 'draft',
  buffer_pct      int not null default 10 check (buffer_pct between 0 and 100),
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- if truck_type='custom', a custom_truck_id should be set; otherwise it must be null
  constraint jobs_custom_truck_consistency check (
    (truck_type = 'custom' and custom_truck_id is not null)
    or (truck_type <> 'custom' and custom_truck_id is null)
  )
);

create index jobs_event_date_idx  on public.jobs (event_date desc nulls last);
create index jobs_updated_at_idx  on public.jobs (updated_at desc);
create index jobs_client_idx      on public.jobs (client) where client is not null;
create index jobs_status_idx      on public.jobs (status);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;

create policy jobs_all on public.jobs
  for all to authenticated using (true) with check (true);

-- ============================================================
-- vendors
-- ============================================================
create table public.vendors (
  id                 uuid primary key default uuid_generate_v4(),
  job_id             uuid not null references public.jobs(id) on delete cascade,
  name               text not null,
  input_method       public.input_method not null,
  input_data         jsonb not null default '{}'::jsonb,
  stackable          boolean,
  weight_lb_override numeric(8,1),
  notes              text,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now()
);

create index vendors_job_id_idx     on public.vendors (job_id);
create index vendors_sort_order_idx on public.vendors (job_id, sort_order);

alter table public.vendors enable row level security;

create policy vendors_all on public.vendors
  for all to authenticated using (true) with check (true);

-- ============================================================
-- case_library  (global presets + org-specific cases)
-- is_global=true rows are immutable to all users.
-- ============================================================
create table public.case_library (
  id                   uuid primary key default uuid_generate_v4(),
  label                text not null,
  depth_in             numeric(6,2) not null check (depth_in > 0),
  width_in             numeric(6,2) not null check (width_in > 0),
  height_in            numeric(6,2) not null check (height_in > 0),
  weight_lb            numeric(8,1) not null check (weight_lb >= 0),
  stackable            boolean not null default true,
  max_stack            int not null default 1 check (max_stack >= 1),
  reference_image_url  text,
  is_global            boolean not null default false,
  created_at           timestamptz not null default now()
);

-- prevent duplicate global preset labels (org cases can collide freely)
create unique index case_library_global_label_idx
  on public.case_library (label) where is_global = true;

alter table public.case_library enable row level security;

create policy case_library_select on public.case_library
  for select to authenticated using (true);

create policy case_library_insert on public.case_library
  for insert to authenticated
  with check (is_global = false);

create policy case_library_update on public.case_library
  for update to authenticated
  using (is_global = false) with check (is_global = false);

create policy case_library_delete on public.case_library
  for delete to authenticated
  using (is_global = false);

-- ============================================================
-- job_snapshots  (immutable after insert)
-- ============================================================
create table public.job_snapshots (
  id          uuid primary key default uuid_generate_v4(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  label       text,
  data        jsonb not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index job_snapshots_job_id_idx on public.job_snapshots (job_id, created_at desc);

alter table public.job_snapshots enable row level security;

create policy job_snapshots_select on public.job_snapshots
  for select to authenticated using (true);

create policy job_snapshots_insert on public.job_snapshots
  for insert to authenticated with check (true);
-- No UPDATE / DELETE policies => snapshots are immutable.

-- ============================================================
-- vendor_self_reports  (Phase 2 schema; no UI yet)
-- ============================================================
create table public.vendor_self_reports (
  id            uuid primary key default uuid_generate_v4(),
  job_id        uuid not null references public.jobs(id) on delete cascade,
  token         text not null unique,
  vendor_name   text not null,
  input_data    jsonb not null default '{}'::jsonb,
  submitted_at  timestamptz,
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index vendor_self_reports_job_id_idx on public.vendor_self_reports (job_id);

alter table public.vendor_self_reports enable row level security;

create policy vendor_self_reports_all on public.vendor_self_reports
  for all to authenticated using (true) with check (true);

-- ============================================================
-- Seed: 15 global case_library presets from the prototype.
-- ============================================================
insert into public.case_library
  (label, depth_in, width_in, height_in, weight_lb, stackable, max_stack, is_global)
values
  ('Pelican 1510',             22, 14,  9,  14,  true,  6, true),
  ('Pelican 1610',             25, 20, 12,  22,  true,  5, true),
  ('Pelican 1620',             28, 21, 13,  30,  true,  5, true),
  ('Pelican 1650',             32, 21, 14,  35,  true,  4, true),
  ('SKB 4U Shock Rack',        26, 22, 15,  40,  true,  4, true),
  ('SKB 6U Shock Rack',        26, 22, 20,  60,  true,  3, true),
  ('SKB 10U Shock Rack',       32, 28, 24, 120,  true,  2, true),
  ('Road case (small)',        30, 22, 18,  35,  true,  3, true),
  ('Road case (medium)',       36, 26, 22,  60,  true,  3, true),
  ('Road case (large)',        48, 30, 30, 100,  true,  2, true),
  ('Cable trunk',              48, 32, 32, 180,  false, 1, true),
  ('Camera flight case',       30, 22, 12,  45,  true,  5, true),
  ('Tripod / sticks case',     48, 10, 10,  40,  true,  2, true),
  ('Standard pallet (48x40)',  48, 40, 48, 500,  false, 1, true),
  ('Custom / unknown',         24, 24, 24,  50,  false, 1, true)
on conflict do nothing;
