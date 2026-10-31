-- Axiom tenancy, Phase 2b: the public key can no longer read client data.
--
-- The client portals (/axiom/portal/<token>, /client/<token>) and the project
-- proposal page (/approve/<token>) now load and save through the server by
-- their link's token (src/lib/portal-server.ts, /api/portal/*), returning only
-- what a client should see. Proposals and invoices already did. So the public
-- (anon) rules that let anyone with the public key list projects, every
-- estimate with a proposal link, files, comments and approvals, and change
-- any approval, are removed. The one public rule kept is the Wallflower
-- request form adding a work order.
--
-- Run AFTER the portal update is live on both sites. Safe to re-run.

begin;

do $$
declare
  p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and roles = array['anon']::name[]
      and not (tablename = 'wallflower_work_orders' and policyname = 'Public intake insert')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end
$$;

commit;

-- Check 1: public (anon) rules left on app tables. Should be exactly one:
-- wallflower_work_orders / Public intake insert.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and 'anon' = any (roles)
order by 1, 2;

-- Check 2 (for the next step): file storage rules, which this script doesn't change.
select policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'storage'
order by 1;
