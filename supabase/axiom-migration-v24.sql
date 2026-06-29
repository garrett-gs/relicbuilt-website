-- v24: Allow richer customer types coming from Wallflower RELIC Nexus.
-- Nexus uses Individual / Business / Venue / Planner; Axiom previously
-- only permitted Individual / Business. Expand the check constraint so the
-- sync can store Venue and Planner faithfully.

do $$
declare
  c_name text;
begin
  -- Drop whatever check constraint currently governs customers.type,
  -- regardless of its generated name.
  select con.conname into c_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'customers'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%type%';

  if c_name is not null then
    execute format('alter table customers drop constraint %I', c_name);
  end if;
end $$;

alter table customers
  add constraint customers_type_check
  check (type in ('Individual', 'Business', 'Venue', 'Planner'));
