-- Axiom tenancy, Phase 1: workspaces exist and every row knows its workspace.
--
-- Wallflower RELIC and RELIC become two workspaces ("tenants"), the way any
-- future Relicon customer will be one. This step is additive only:
--   * tenants + tenant_members (the team, per workspace),
--   * current_tenant_id(): the workspace a request is acting in,
--   * a tenant_id column on every table, filled in for every existing row and
--     for every new row automatically (from the row's business, its parent
--     record, or the request's workspace).
-- Nothing reads tenant_id yet and no access rule changes, so both sites keep
-- working exactly as they do. Phase 2 switches the access rules to tenant_id,
-- creates RELIC's own copy of the shared materials and its own Settings row.
--
-- Decisions (Garrett, 2026-10-31): shop materials (inventory, vendors, vendor
-- catalog, shopping lists) are COPIED to both workspaces in Phase 2; records
-- tied to no project or business go to Wallflower; everyone on today's roster
-- is a member of both workspaces.
--
-- Safe to re-run. Run in the Axiom Supabase SQL editor.

begin;

-- ── Workspaces ───────────────────────────────────────────────────────────────

create table if not exists public.tenants (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9_]+$'),
  name               text not null,
  -- The Relicon billing account that pays for this workspace (billing lives
  -- in the Hone project; this is only a reference).
  billing_account_id uuid unique,
  created_at         timestamptz not null default now()
);

-- Slugs match today's `entity` values so the two can be mapped both ways.
insert into public.tenants (slug, name, billing_account_id) values
  ('wallflower_relic', 'Wallflower RELIC', 'e6f9dccc-b0d6-445e-a8bb-908ecde5acac'),
  ('relic',            'RELIC',            'ca53f3c0-5a07-4ae2-b457-85468c4166ae')
on conflict (slug) do nothing;

create table if not exists public.tenant_members (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  email         text not null check (email = lower(trim(email)) and email <> ''),
  user_id       uuid,           -- auth user, linked by email when known
  name          text not null default '',
  role          text not null default 'staff' check (role in ('superadmin', 'admin', 'manager', 'staff')),
  phone         text,
  pin           text,
  hourly_rate   numeric not null default 0,
  color         text,
  notifications jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, email)
);
create index if not exists tenant_members_user_idx on public.tenant_members (user_id);
create index if not exists tenant_members_email_idx on public.tenant_members (email);

-- ── Which workspace is this request in? ──────────────────────────────────────
-- The app sends the workspace slug in an `x-axiom-tenant` header (each site
-- is locked to one business). It only counts if the signed-in person is an
-- active member of that workspace; the server's service key may act in any.

create or replace function public.tenancy_request_slug()
returns text
language sql
stable
as $$
  select nullif(
    coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-axiom-tenant',
    ''
  )
$$;

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
      or exists (
        select 1 from public.tenant_members m
        where m.tenant_id = t.id
          and m.active
          and (m.user_id = auth.uid() or m.email = lower(auth.jwt() ->> 'email'))
      )
    )
$$;
grant execute on function public.current_tenant_id() to anon, authenticated;

create or replace function public.tenant_id_for_slug(p_slug text)
returns uuid
language sql
stable
set search_path = public
as $$
  select id from public.tenants where slug = p_slug
$$;

-- ── Team: kept in step with Settings → Team until Phase 2 ────────────────────
-- Settings' team_members JSON stays the source of truth for now. Whenever it
-- changes, every workspace's member list is brought in line: people are added
-- or updated by email, and anyone no longer on the roster is marked inactive
-- (never deleted). Roster entries without an email can't be matched and are
-- skipped.

create or replace function public.tenancy_sync_members(p_roster jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  m jsonb;
  v_email text;
  v_emails text[] := '{}';
begin
  for m in select * from jsonb_array_elements(coalesce(p_roster, '[]'::jsonb)) loop
    v_email := lower(trim(coalesce(m ->> 'email', '')));
    if v_email <> '' then
      v_emails := v_emails || v_email;
    end if;
  end loop;

  for t in select id from public.tenants loop
    for m in select * from jsonb_array_elements(coalesce(p_roster, '[]'::jsonb)) loop
      v_email := lower(trim(coalesce(m ->> 'email', '')));
      continue when v_email = '';
      insert into public.tenant_members as tm
        (tenant_id, email, user_id, name, role, phone, pin, hourly_rate, color, notifications, active)
      values (
        t.id,
        v_email,
        (select u.id from auth.users u where lower(u.email) = v_email limit 1),
        coalesce(m ->> 'name', ''),
        case when m ->> 'role' in ('superadmin', 'admin', 'manager', 'staff') then m ->> 'role' else 'staff' end,
        nullif(m ->> 'phone', ''),
        nullif(m ->> 'pin', ''),
        coalesce(nullif(m ->> 'hourly_rate', '')::numeric, 0),
        nullif(m ->> 'color', ''),
        coalesce(m -> 'notifications', '{}'::jsonb),
        true
      )
      on conflict (tenant_id, email) do update set
        user_id       = coalesce(excluded.user_id, tm.user_id),
        name          = excluded.name,
        role          = excluded.role,
        phone         = excluded.phone,
        pin           = excluded.pin,
        hourly_rate   = excluded.hourly_rate,
        color         = excluded.color,
        notifications = excluded.notifications,
        active        = true,
        updated_at    = now();
    end loop;

    update public.tenant_members
      set active = false, updated_at = now()
      where tenant_id = t.id and active and not (email = any (v_emails));
  end loop;
end
$$;
revoke all on function public.tenancy_sync_members(jsonb) from public, anon, authenticated;

create or replace function public.tenancy_settings_roster_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.tenancy_sync_members(new.team_members);
  return new;
end
$$;

drop trigger if exists tenancy_roster_sync on public.settings;
create trigger tenancy_roster_sync
  after insert or update of team_members on public.settings
  for each row execute function public.tenancy_settings_roster_changed();

-- ── tenant_id on every table ─────────────────────────────────────────────────

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
    'purchase_orders', 'receipts', 'settings', 'shopping_lists', 'task_notes', 'tasks',
    'time_entries', 'vendor_catalog', 'vendors', 'wallflower_work_orders'
  ] loop
    execute format('alter table public.%I add column if not exists tenant_id uuid references public.tenants (id)', t);
    execute format('create index if not exists %I on public.%I (tenant_id)', t || '_tenant_idx', t);
  end loop;
end
$$;

comment on column public.settings.tenant_id is
  'Null = the shared Settings row both businesses use today. Phase 2 gives each workspace its own row.';

-- The workspace a record (looked up by id in any business table) belongs to.
-- activity_log points at records this way.
create or replace function public.tenancy_tenant_of_record(p_kind text, p_id uuid)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v uuid;
begin
  if p_id is null then
    return null;
  end if;
  case p_kind
    when 'estimate'              then select tenant_id into v from public.estimates where id = p_id;
    when 'purchase_order'        then select tenant_id into v from public.purchase_orders where id = p_id;
    when 'project'               then select tenant_id into v from public.custom_work where id = p_id;
    when 'customer'              then select tenant_id into v from public.customers where id = p_id;
    when 'company'               then select tenant_id into v from public.companies where id = p_id;
    when 'expense'               then select tenant_id into v from public.expenses where id = p_id;
    when 'invoice'               then select tenant_id into v from public.invoices where id = p_id;
    when 'master_project'        then select tenant_id into v from public.master_projects where id = p_id;
    when 'note'                  then select tenant_id into v from public.notes where id = p_id;
    when 'task'                  then select tenant_id into v from public.tasks where id = p_id;
    when 'inventory'             then select tenant_id into v from public.inventory_items where id = p_id;
    when 'work_order', 'wallflower_work_order'
                                 then select tenant_id into v from public.wallflower_work_orders where id = p_id;
    else v := null;
  end case;
  return v;
end
$$;

-- Fills tenant_id on a new row (and follows `entity` when a record is moved
-- to the other business). Order: an explicit tenant_id, the row's own business,
-- its parent record, then the request's workspace. Anything still unknown is
-- left empty and shows up in the check at the bottom; Phase 2 closes those
-- gaps before tenant_id becomes required.
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
      v := public.tenant_id_for_slug('wallflower_relic');
    when 'activity_log' then
      v := public.tenancy_tenant_of_record(r ->> 'entity', (r ->> 'entity_id')::uuid);
    else
      v := null;
  end case;

  new.tenant_id := coalesce(v, public.current_tenant_id());
  return new;
end
$$;

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
    execute format('drop trigger if exists tenancy_fill on public.%I', t);
    execute format(
      'create trigger tenancy_fill before insert or update on public.%I
         for each row execute function public.tenancy_fill_tenant_id()', t);
  end loop;
end
$$;

-- ── Tag every existing row ───────────────────────────────────────────────────
-- Parents first, so children can follow them. Only rows still untagged are
-- touched, so a re-run changes nothing.

do $$
declare
  wr    uuid := public.tenant_id_for_slug('wallflower_relic');
  t     text;
begin
  -- Rows with their own business.
  foreach t in array array[
    'companies', 'customers', 'custom_work', 'estimates', 'expenses', 'invoices',
    'purchase_orders', 'master_projects', 'notes', 'parts_library'
  ] loop
    execute format(
      'update public.%I set tenant_id = public.tenant_id_for_slug(entity) where tenant_id is null', t);
  end loop;

  -- Children of a project.
  foreach t in array array[
    'approval_requests', 'build_comments', 'build_files', 'custom_work_parts', 'tasks', 'time_entries'
  ] loop
    execute format(
      'update public.%I c set tenant_id = w.tenant_id
         from public.custom_work w where c.custom_work_id = w.id and c.tenant_id is null', t);
  end loop;

  update public.proposal_audit_events e set tenant_id = s.tenant_id
    from public.estimates s where e.estimate_id = s.id and e.tenant_id is null;

  update public.receipts r set tenant_id = p.tenant_id
    from public.purchase_orders p where r.purchase_order_id = p.id and r.tenant_id is null;
  update public.receipts r set tenant_id = w.tenant_id
    from public.custom_work w where r.project_id = w.id and r.tenant_id is null;

  update public.inventory_transactions x set tenant_id = w.tenant_id
    from public.custom_work w where x.custom_work_id = w.id and x.tenant_id is null;

  -- Shop materials: Wallflower's for now; RELIC gets its copy in Phase 2.
  -- Records tied to no project or business: Wallflower (decided).
  foreach t in array array[
    'inventory_categories', 'inventory_items', 'inventory_transactions', 'vendors',
    'vendor_catalog', 'shopping_lists', 'field_note_notebooks', 'task_notes',
    'product_catalogs', 'products', 'log_archives', 'receipts', 'tasks', 'time_entries',
    'approval_requests', 'build_comments', 'build_files', 'custom_work_parts',
    'proposal_audit_events', 'wallflower_work_orders'
  ] loop
    execute format('update public.%I set tenant_id = $1 where tenant_id is null', t) using wr;
  end loop;

  -- Activity log: the workspace of the record each line is about, else Wallflower.
  update public.activity_log set tenant_id = coalesce(public.tenancy_tenant_of_record(entity, entity_id), wr)
    where tenant_id is null;
end
$$;

-- Today's roster becomes both workspaces' members.
select public.tenancy_sync_members(
  (select team_members from public.settings order by created_at limit 1)
);

-- ── Access to the new tables ─────────────────────────────────────────────────
-- Members see their own workspaces and teammates; changes go through Settings
-- (the trigger above) or the server.

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;

drop policy if exists "Members read their workspaces" on public.tenants;
create policy "Members read their workspaces" on public.tenants
  for select to authenticated
  using (exists (
    select 1 from public.tenant_members m
    where m.tenant_id = tenants.id and m.active
      and (m.user_id = auth.uid() or m.email = lower(auth.jwt() ->> 'email'))
  ));

create or replace function public.tenancy_my_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.tenant_members
  where active and (user_id = auth.uid() or email = lower(auth.jwt() ->> 'email'))
$$;
grant execute on function public.tenancy_my_tenant_ids() to authenticated;

drop policy if exists "Members read their teams" on public.tenant_members;
create policy "Members read their teams" on public.tenant_members
  for select to authenticated
  using (tenant_id in (select public.tenancy_my_tenant_ids()));

commit;

-- ── Check ────────────────────────────────────────────────────────────────────
-- Rows per workspace for each table. "untagged" should be 0 everywhere except
-- settings (1: the shared row, split in Phase 2).
select x.table_name,
       count(*) filter (where t.slug = 'wallflower_relic') as wallflower,
       count(*) filter (where t.slug = 'relic')            as relic,
       count(*) filter (where x.tenant_id is null)         as untagged
from (
  select 'activity_log' as table_name, tenant_id from public.activity_log
  union all select 'approval_requests', tenant_id from public.approval_requests
  union all select 'build_comments', tenant_id from public.build_comments
  union all select 'build_files', tenant_id from public.build_files
  union all select 'companies', tenant_id from public.companies
  union all select 'custom_work', tenant_id from public.custom_work
  union all select 'custom_work_parts', tenant_id from public.custom_work_parts
  union all select 'customers', tenant_id from public.customers
  union all select 'estimates', tenant_id from public.estimates
  union all select 'expenses', tenant_id from public.expenses
  union all select 'field_note_notebooks', tenant_id from public.field_note_notebooks
  union all select 'inventory_categories', tenant_id from public.inventory_categories
  union all select 'inventory_items', tenant_id from public.inventory_items
  union all select 'inventory_transactions', tenant_id from public.inventory_transactions
  union all select 'invoices', tenant_id from public.invoices
  union all select 'log_archives', tenant_id from public.log_archives
  union all select 'master_projects', tenant_id from public.master_projects
  union all select 'notes', tenant_id from public.notes
  union all select 'parts_library', tenant_id from public.parts_library
  union all select 'product_catalogs', tenant_id from public.product_catalogs
  union all select 'products', tenant_id from public.products
  union all select 'proposal_audit_events', tenant_id from public.proposal_audit_events
  union all select 'purchase_orders', tenant_id from public.purchase_orders
  union all select 'receipts', tenant_id from public.receipts
  union all select 'settings', tenant_id from public.settings
  union all select 'shopping_lists', tenant_id from public.shopping_lists
  union all select 'task_notes', tenant_id from public.task_notes
  union all select 'tasks', tenant_id from public.tasks
  union all select 'time_entries', tenant_id from public.time_entries
  union all select 'vendor_catalog', tenant_id from public.vendor_catalog
  union all select 'vendors', tenant_id from public.vendors
  union all select 'wallflower_work_orders', tenant_id from public.wallflower_work_orders
  union all select '— team members (active)', tenant_id from public.tenant_members where active
) x
left join public.tenants t on t.id = x.tenant_id
group by x.table_name
order by x.table_name;
