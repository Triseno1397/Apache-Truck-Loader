-- Per-vendor manual placement overrides for the truck packer.
--
-- The auto-packer is the default: every vendor's items get arranged
-- according to the cross-vendor shelf algorithm. The crew can drag any
-- item rectangle in the truck render to anchor it at a specific spot
-- on the truck floor; that anchor lives here.
--
-- Shape:
--   manual_placements = [
--     { "xIn": <number>, "yIn": <number> },
--     ...
--   ]
--
-- Each entry corresponds to ONE item in the vendor's expansion (e.g., for
-- a "pallets, qty 5" vendor, entries 0..4 map to pallets 1..5). Items
-- beyond the manual count get auto-packed AROUND the manual ones.
--   xIn = distance from the front of the truck along the cargo length
--   yIn = offset across the truck width from the driver-side wall
-- Both are integer inches snapped to a 6" grid by the UI before persist.
--
-- Idempotent: skips if the column already exists.

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendors'
      and column_name = 'manual_placements'
  ) then
    alter table public.vendors
      add column manual_placements jsonb not null default '[]'::jsonb;
  end if;
end $$;
