-- Axiom tenancy, Phase 3: the Relicon bill decides what a workspace can do.
--
-- Each workspace (tenant) carries its billing state, copied from
-- billing.relicon.app by the app (src/lib/relicon-billing.ts: when someone
-- opens Axiom, at most hourly, and by a daily job):
--   full      — normal use (active, trialing, comped, or past due within grace)
--   read_only — past due beyond the grace period: the team can see everything
--               but not add, change or delete anything
--   none      — canceled, or the plan doesn't include Axiom: nothing is visible
-- The database enforces it, so no screen or route can get around it. The
-- server's own work (client payments, portal approvals and comments, the
-- Wallflower request form, Nexus sync) isn't blocked: a past-due business
-- should still be able to get paid.
--
-- Needs Phases 1–2. Safe to re-run. Run in the Axiom Supabase SQL editor.

begin;

alter table public.tenants
  add column if not exists access             text not null default 'full'
                                              check (access in ('full', 'read_only', 'none')),
  add column if not exists billing_status     text,         -- Relicon's effective status (active, past_due, …)
  add column if not exists grace_ends_at      timestamptz,  -- when a past-due workspace turns read-only
  add column if not exists trial_ends_at      timestamptz,
  add column if not exists billing_checked_at timestamptz;  -- last successful check

-- A canceled workspace is no workspace: requests naming it act in none.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.tenants t
  where t.slug = public.tenancy_request_slug()
    and (
      coalesce(current_setting('request.jwt.claim.role', true), auth.jwt() ->> 'role') = 'service_role'
      or (
        t.access <> 'none'
        and exists (
          select 1 from public.tenant_members m
          where m.tenant_id = t.id
            and m.active
            and (m.user_id = auth.uid() or m.email = lower(auth.jwt() ->> 'email'))
        )
      )
    )
$$;

-- May this request change data? Only in a workspace with full access.
create or replace function public.tenancy_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select t.access = 'full' from public.tenants t where t.id = public.current_tenant_id()), false)
$$;
grant execute on function public.tenancy_can_write() to authenticated;

-- On top of "Workspace members" (which decides which rows), every add, change
-- and delete by a signed-in user must also pass the billing check. Restrictive
-- rules are ANDed with the others, so reads are untouched.
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
    'time_entries', 'vendor_catalog', 'vendors', 'wallflower_work_orders', 'settings'
  ] loop
    execute format('drop policy if exists "Billing allows adding" on public.%I', t);
    execute format('drop policy if exists "Billing allows changes" on public.%I', t);
    execute format('drop policy if exists "Billing allows deleting" on public.%I', t);
    execute format(
      'create policy "Billing allows adding" on public.%I as restrictive for insert to authenticated
         with check (public.tenancy_can_write())', t);
    execute format(
      'create policy "Billing allows changes" on public.%I as restrictive for update to authenticated
         using (public.tenancy_can_write()) with check (public.tenancy_can_write())', t);
    execute format(
      'create policy "Billing allows deleting" on public.%I as restrictive for delete to authenticated
         using (public.tenancy_can_write())', t);
  end loop;
end
$$;

-- File uploads by signed-in users follow the same rule (the server's uploads,
-- like client portal photos, aren't affected).
drop policy if exists portal_images_insert on storage.objects;
create policy portal_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portal-images' and public.tenancy_can_write());
drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and public.tenancy_can_write());

commit;

-- Check: both workspaces start with full access (the app fills in the rest
-- on its first billing check).
select slug, name, access, billing_status, grace_ends_at, billing_checked_at
from public.tenants
order by slug;
