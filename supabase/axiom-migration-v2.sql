-- Axiom v2 — Vendors + Material Catalog + Multi-line POs

-- Vendors
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  website text,
  notes text,
  status text default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz default now()
);

-- Vendor Material Catalog
create table if not exists vendor_catalog (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade not null,
  item_number text,
  description text not null,
  unit_price numeric default 0,
  unit text default 'ea',
  category text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Add vendor_id and line_items to purchase_orders
alter table purchase_orders add column if not exists vendor_id uuid references vendors(id) on delete set null;
alter table purchase_orders add column if not exists line_items jsonb default '[]';

-- RLS for new tables
alter table vendors enable row level security;
alter table vendor_catalog enable row level security;

create policy "Auth full access" on vendors for all to authenticated using (true) with check (true);
create policy "Auth full access" on vendor_catalog for all to authenticated using (true) with check (true);
