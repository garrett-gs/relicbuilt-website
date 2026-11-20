-- v51: Wallflower work orders follow the request workspace, not a hardcode.
--
-- The tenancy stamp trigger (tenancy_fill_tenant_id, phase1/phase2a) hardcoded
-- every wallflower_work_orders insert to tenant_id = wallflower_relic. That was
-- correct in the two-site model (this table was inherently Wallflower's), but in
-- the one-Relic-home model the Wallflower Hub intake lives under `relic`. The
-- hardcode made every Nexus intake land in wallflower_relic regardless of the
-- x-axiom-tenant header, so the Relic-home Hub (reading `relic`) never saw new
-- rows — no app/env/build change could fix it because the DB ignored the header.
--
-- Fix: stamp from current_tenant_id() (the request's workspace), falling back to
-- wallflower_relic only when there is no workspace context (e.g. a header-less
-- public insert). create or replace only — the existing trigger keeps pointing
-- at this function. Idempotent; safe to run on the live DB.

create or replace function public.tenancy_fill_tenant_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := to_jsonb(new);
  v uuid;
begin
  -- A business change (entity) moves the row to that workspace.
  if tg_op = 'UPDATE' then
    if r ? 'entity'
       and tg_table_name <> 'activity_log'
       and (r ->> 'entity') is distinct from (to_jsonb(old) ->> 'entity') then
      new.tenant_id := public.tenant_id_for_slug(r ->> 'entity');
    end if;
    return new;
  end if;

  if new.tenant_id is not null then
    return new;
  end if;

  case tg_table_name
    when 'companies', 'customers', 'custom_work', 'estimates', 'expenses', 'invoices',
         'purchase_orders', 'master_projects', 'notes', 'parts_library' then
      v := public.tenant_id_for_slug(r ->> 'entity');
    when 'approval_requests', 'build_comments', 'build_files', 'custom_work_parts', 'tasks', 'time_entries' then
      select tenant_id into v from public.custom_work where id = (r ->> 'custom_work_id')::uuid;
    when 'inventory_transactions' then
      select tenant_id into v from public.custom_work where id = (r ->> 'custom_work_id')::uuid;
      if v is null then
        select tenant_id into v from public.inventory_items where id = (r ->> 'inventory_item_id')::uuid;
      end if;
    when 'vendor_catalog' then
      select tenant_id into v from public.vendors where id = (r ->> 'vendor_id')::uuid;
    when 'inventory_items' then
      -- Items made by the catalog automation (trg_catalog_insert_sync) follow
      -- their catalog item, then their vendor.
      select tenant_id into v from public.vendor_catalog where id = (r ->> 'catalog_item_id')::uuid;
      if v is null then
        select tenant_id into v from public.vendors where id = (r ->> 'vendor_id')::uuid;
      end if;
    when 'products' then
      select tenant_id into v from public.product_catalogs where id = (r ->> 'catalog_id')::uuid;
    when 'proposal_audit_events' then
      select tenant_id into v from public.estimates where id = (r ->> 'estimate_id')::uuid;
    when 'receipts' then
      select tenant_id into v from public.purchase_orders where id = (r ->> 'purchase_order_id')::uuid;
      if v is null then
        select tenant_id into v from public.custom_work where id = (r ->> 'project_id')::uuid;
      end if;
    when 'wallflower_work_orders' then
      -- v51: follow the request workspace (one Relic home) instead of hardcoding
      -- wallflower_relic; fall back to wallflower only with no workspace context.
      v := coalesce(public.current_tenant_id(), public.tenant_id_for_slug('wallflower_relic'));
    when 'activity_log' then
      v := public.tenancy_tenant_of_record(r ->> 'entity', (r ->> 'entity_id')::uuid);
    else
      v := null;
  end case;

  new.tenant_id := coalesce(v, public.current_tenant_id());
  return new;
end
$$;
