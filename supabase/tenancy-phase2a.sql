-- Axiom tenancy, Phase 2a: each site sees only its own workspace.
--
-- Needs Phase 1 (tenancy-phase1.sql) and the app code that names each site's
-- workspace on every request (x-axiom-tenant, from the browser and from the
-- server's axiomAdmin()). In one transaction:
--   1. RELIC gets its own copy of the shop materials (vendors, vendor catalog,
--      inventory categories and items, shopping lists), and RELIC's records
--      that pointed at Wallflower's vendors or items now point at RELIC's copy.
--      Stock history (inventory transactions) stays with Wallflower; RELIC's
--      items start with the same on-hand counts.
--   2. Signed-in access becomes "rows in the workspace this site is acting in"
--      on every table. The public client-portal and proposal rules (anon) are
--      left exactly as they are; Phase 2b moves those behind secure links.
--      Settings stays one shared row both businesses read (its split is Phase 4).
--   3. tenant_id becomes required everywhere except Settings, so nothing can be
--      saved without a workspace.
-- If anything fails (for example an untagged row), the whole script rolls back.
--
-- Safe to re-run. Run in the Axiom Supabase SQL editor.

begin;

-- ── 1. RELIC's copy of the shop materials ────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['vendors', 'vendor_catalog', 'inventory_categories', 'inventory_items', 'shopping_lists'] loop
    execute format('alter table public.%I add column if not exists copied_from uuid', t);
  end loop;
end
$$;
comment on column public.vendors.copied_from is 'Phase 2a: the Wallflower row this RELIC copy was made from.';

do $$
declare
  wr    uuid := public.tenant_id_for_slug('wallflower_relic');
  relic uuid := public.tenant_id_for_slug('relic');
  t     text;
begin
  -- Copy each Wallflower row once (copied_from marks the copy; a re-run skips
  -- rows already copied). Every column carries over; only id, workspace and
  -- copied_from change.
  foreach t in array array['vendors', 'vendor_catalog', 'inventory_categories', 'inventory_items', 'shopping_lists'] loop
    execute format($f$
      insert into public.%1$I
      select (jsonb_populate_record(
        null::public.%1$I,
        to_jsonb(src) || jsonb_build_object('id', gen_random_uuid(), 'tenant_id', $2, 'copied_from', src.id)
      )).*
      from public.%1$I src
      where src.tenant_id = $1
        and src.copied_from is null
        and not exists (select 1 from public.%1$I c where c.copied_from = src.id and c.tenant_id = $2)
    $f$, t) using wr, relic;
  end loop;

  -- Point RELIC's copies (and RELIC's own records) at RELIC's copies.
  update public.vendor_catalog x set vendor_id = c.id
    from public.vendors c
    where x.tenant_id = relic and c.tenant_id = relic and c.copied_from = x.vendor_id;

  update public.inventory_items x set vendor_id = c.id
    from public.vendors c
    where x.tenant_id = relic and c.tenant_id = relic and c.copied_from = x.vendor_id;
  update public.inventory_items x set category_id = c.id
    from public.inventory_categories c
    where x.tenant_id = relic and c.tenant_id = relic and c.copied_from = x.category_id;
  update public.inventory_items x set catalog_item_id = c.id
    from public.vendor_catalog c
    where x.tenant_id = relic and c.tenant_id = relic and c.copied_from = x.catalog_item_id;

  update public.purchase_orders x set vendor_id = c.id
    from public.vendors c
    where x.tenant_id = relic and c.tenant_id = relic and c.copied_from = x.vendor_id;
  update public.estimates x set vendor_id = c.id
    from public.vendors c
    where x.tenant_id = relic and c.tenant_id = relic and c.copied_from = x.vendor_id;
  update public.inventory_transactions x set inventory_item_id = c.id
    from public.inventory_items c
    where x.tenant_id = relic and c.tenant_id = relic and c.copied_from = x.inventory_item_id;
end
$$;

-- ── 2. Signed-in access: this site's workspace only ──────────────────────────
-- Every rule except the public (anon-only) portal/proposal/intake ones is
-- replaced by one: rows whose workspace is the one this request acts in.
-- current_tenant_id() is empty unless the person is an active member of the
-- workspace their site names, so non-members see nothing.

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'activity_log', 'approval_requests', 'build_comments', 'build_files', 'companies',
    'custom_work', 'custom_work_parts', 'customers', 'estimates', 'expenses',
    'field_note_notebooks', 'inventory_categories', 'inventory_items',
    'inventory_transactions', 'invoices', 'log_archives', 'master_projects', 'notes',
    'parts_library', 'product_catalogs', 'products', 'proposal_audit_events',
    'purchase_orders', 'receipts', 'shopping_lists', 'task_notes', 'tasks',
    'time_entries', 'vendor_catalog', 'vendors', 'wallflower_work_orders', 'settings'
  ] loop
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t and roles <> array['anon']::name[]
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);

    if t = 'settings' then
      -- One shared row for now: readable and editable by members of either workspace.
      execute $p$
        create policy "Workspace members" on public.settings
          for all to authenticated
          using (public.current_tenant_id() is not null
                 and (tenant_id is null or tenant_id = public.current_tenant_id()))
          with check (public.current_tenant_id() is not null
                      and (tenant_id is null or tenant_id = public.current_tenant_id()))
      $p$;
    else
      execute format($p$
        create policy "Workspace members" on public.%I
          for all to authenticated
          using (tenant_id = public.current_tenant_id())
          with check (tenant_id = public.current_tenant_id())
      $p$, t);
    end if;
  end loop;
end
$$;

-- ── 3. Every row must have a workspace ───────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'activity_log', 'approval_requests', 'build_comments', 'build_files', 'companies',
    'custom_work', 'custom_work_parts', 'customers', 'estimates', 'expenses',
    'field_note_notebooks', 'inventory_categories', 'inventory_items',
    'inventory_transactions', 'invoices', 'log_archives', 'master_projects', 'notes',
    'parts_library', 'product_catalogs', 'products', 'proposal_audit_events',
    'purchase_orders', 'receipts', 'shopping_lists', 'task_notes', 'tasks',
    'time_entries', 'vendor_catalog', 'vendors', 'wallflower_work_orders'
  ] loop
    execute format('alter table public.%I alter column tenant_id set not null', t);
  end loop;
end
$$;

commit;

-- ── Check ────────────────────────────────────────────────────────────────────
-- 1) Materials per workspace: RELIC should now match Wallflower.
select 'vendors' as what,
       count(*) filter (where tenant_id = public.tenant_id_for_slug('wallflower_relic')) as wallflower,
       count(*) filter (where tenant_id = public.tenant_id_for_slug('relic')) as relic
  from public.vendors
union all select 'vendor_catalog',
       count(*) filter (where tenant_id = public.tenant_id_for_slug('wallflower_relic')),
       count(*) filter (where tenant_id = public.tenant_id_for_slug('relic'))
  from public.vendor_catalog
union all select 'inventory_categories',
       count(*) filter (where tenant_id = public.tenant_id_for_slug('wallflower_relic')),
       count(*) filter (where tenant_id = public.tenant_id_for_slug('relic'))
  from public.inventory_categories
union all select 'inventory_items',
       count(*) filter (where tenant_id = public.tenant_id_for_slug('wallflower_relic')),
       count(*) filter (where tenant_id = public.tenant_id_for_slug('relic'))
  from public.inventory_items
union all select 'shopping_lists',
       count(*) filter (where tenant_id = public.tenant_id_for_slug('wallflower_relic')),
       count(*) filter (where tenant_id = public.tenant_id_for_slug('relic'))
  from public.shopping_lists
-- 2) RELIC records still pointing at a Wallflower vendor or item (should be 0).
union all select 'RELIC links into Wallflower (should be 0)',
       (select count(*) from public.purchase_orders p join public.vendors v on v.id = p.vendor_id
          where p.tenant_id <> v.tenant_id)
     + (select count(*) from public.estimates e join public.vendors v on v.id = e.vendor_id
          where e.tenant_id <> v.tenant_id)
     + (select count(*) from public.inventory_transactions x join public.inventory_items i on i.id = x.inventory_item_id
          where x.tenant_id <> i.tenant_id and x.tenant_id = public.tenant_id_for_slug('relic')),
       null;
