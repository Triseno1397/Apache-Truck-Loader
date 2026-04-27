-- Drop the per-truck "buffer" reserve column.
--
-- The buffer was a percentage carved out of the truck's interior length
-- to leave headroom for cable ramps, gaff kits, tie-downs, etc. The crew
-- found it unnecessary in practice and asked for it gone. Removed both
-- the column and every UI affordance that drove it.
--
-- No backwards-compat shim per CLAUDE.md ("when the data model changes,
-- change the code; don't keep dual paths").

alter table public.job_trucks drop column if exists buffer_pct;
