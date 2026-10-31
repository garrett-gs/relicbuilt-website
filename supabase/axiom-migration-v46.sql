-- v46 — Retire the per-member "Relic access" restriction.
--
-- Relic is no longer a private entity: every authenticated Axiom user may read
-- and write Relic rows. has_relic_access() now returns true for everyone, so
-- the entity-scoped policies from v32/v38/v39 evaluate to "visible to all"
-- while staying in place (easy to re-tighten later for a tenancy model). The
-- settings.team_members `relic_access` flag is no longer consulted anywhere.
create or replace function public.has_relic_access()
returns boolean
language sql stable security definer
set search_path = public
as $$ select true $$;
