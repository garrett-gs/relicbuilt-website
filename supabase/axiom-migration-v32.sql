-- v32: Phase 3 — DB-enforced privacy for the "Relic" business entity.
-- Replaces the blanket `using(true)` authenticated policies with entity-scoped
-- rules so team members WITHOUT Relic access cannot read/write Relic rows, even
-- outside the app. Wallflower rows stay visible to everyone. Anon/portal and
-- service-role policies are intentionally left untouched (service-role bypasses
-- RLS; anon/portal are handled in a later hardening pass).
--
-- Access is decided by has_relic_access(), which reads the SAME relic_access
-- flag the Settings UI writes (settings.team_members) — one source of truth.
-- This file is idempotent; re-running it re-asserts the current live state.

-- ── Access helper ────────────────────────────────────────────
create or replace function public.has_relic_access()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from settings s,
         jsonb_array_elements(coalesce(s.team_members, '[]'::jsonb)) m
    where lower(m->>'email') = lower(auth.email())
      and (m->>'role' = 'superadmin' or (m->>'relic_access')::boolean is true)
  );
$$;
grant execute on function public.has_relic_access() to authenticated;

-- ── Parent tables (carry their own `entity` column) ──────────
do $$
declare t text;
begin
  foreach t in array array['expenses','custom_work','estimates','invoices','purchase_orders','customers','companies']
  loop
    execute format('drop policy if exists "Auth full access" on %I', t);
    execute format('drop policy if exists "Entity access" on %I', t);
    execute format($f$
      create policy "Entity access" on %I for all to authenticated
        using ( entity = 'wallflower_relic' or public.has_relic_access() )
        with check ( entity = 'wallflower_relic' or public.has_relic_access() )
    $f$, t);
  end loop;
end $$;

-- ── Child tables (gated by their parent project's entity) ────
-- Shop/unlinked rows (custom_work_id is null) stay visible to everyone.
do $$
declare t text;
begin
  foreach t in array array['tasks','build_files','build_comments','approval_requests','time_entries']
  loop
    execute format('drop policy if exists "Auth full access" on %I', t);
    execute format('drop policy if exists "Entity access" on %I', t);
    execute format($f$
      create policy "Entity access" on %I for all to authenticated
        using ( public.has_relic_access() or custom_work_id is null
                or exists (select 1 from custom_work cw where cw.id = %I.custom_work_id and cw.entity = 'wallflower_relic') )
        with check ( public.has_relic_access() or custom_work_id is null
                or exists (select 1 from custom_work cw where cw.id = %I.custom_work_id and cw.entity = 'wallflower_relic') )
    $f$, t, t, t);
  end loop;
end $$;

-- Intentionally NOT gated (shared across both businesses): inventory_transactions.
-- Deferred to a later hardening pass (public/anon flows): receipts, plus the
-- anon over-shares on settings, build_files/comments/approval_requests, time_entries.
