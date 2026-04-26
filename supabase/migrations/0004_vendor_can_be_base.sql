-- Adds a per-vendor "can other gear be stacked on top of this" override.
-- Parallels the existing `stackable` column (which means "can this gear
-- itself be stacked on top of others"). Both are nullable - null means
-- "use the case preset's default behaviour".
--
-- Idempotent: skips the alter if the column already exists.

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendors'
      and column_name = 'can_be_base'
  ) then
    alter table public.vendors add column can_be_base boolean;
  end if;
end $$;
