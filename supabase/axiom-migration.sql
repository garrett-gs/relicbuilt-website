-- Axiom — RELIC Project Management Portal
-- Run this in your Supabase SQL Editor

-- Settings (single-row config)
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  biz_name text default 'RELIC',
  biz_email text,
  biz_phone text default '(402) 235-8179',
  logo_url text,
  accent_color text default '#c4a24d',
  terms_text text,
  deposit_percent numeric default 50,
  balance_due_days integer default 14,
  invoice_send_days integer default 7,
  reminder_interval_days integer default 3,
  team_members jsonb default '[]',
  categories text[] default '{"Woodworking","Metalworking","Mixed","Furniture","Cabinetry","Millwork","Specialty"}',
  created_at timestamptz default now()
);

-- Seed default settings row
insert into settings (biz_name) values ('RELIC') on conflict do nothing;

-- Companies
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  industry text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Customers
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  type text default 'Individual' check (type in ('Individual', 'Business')),
  address text,
  website text,
  industry text,
  status text default 'active' check (status in ('active', 'inactive')),
  notes jsonb default '[]',
  company_id uuid references companies(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Custom Work / Projects
create table if not exists custom_work (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  client_name text,
  client_email text,
  client_phone text,
  customer_id uuid references customers(id) on delete set null,
  company_name text,
  project_description text,
  budget_range text,
  timeline text,
  status text default 'new' check (status in ('new', 'in_review', 'quoted', 'in_progress', 'complete')),
  internal_notes text,
  quoted_amount numeric default 0,
  actual_cost numeric default 0,
  materials jsonb default '[]',
  labor_log jsonb default '[]',
  start_date date,
  due_date date,
  image_url text,
  inspiration_images text[] default '{}',
  portal_enabled boolean default false,
  portal_token text unique,
  portal_stage text default 'consultation' check (portal_stage in ('consultation', 'design', 'approval', 'fabrication', 'finishing', 'delivery')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tasks
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text default 'medium' check (priority in ('high', 'medium', 'low')),
  assignee text,
  due_date date,
  comments jsonb default '[]',
  custom_work_id uuid references custom_work(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Invoices
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  custom_work_id uuid references custom_work(id) on delete set null,
  client_name text,
  client_email text,
  description text,
  issued_date date,
  due_date date,
  subtotal numeric default 0,
  delivery_fee numeric default 0,
  discount numeric default 0,
  tax_rate numeric default 8.75,
  payments jsonb default '[]',
  status text default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  notes text,
  reminders_sent integer default 0,
  last_reminder_sent timestamptz,
  next_reminder_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Purchase Orders
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text unique not null,
  vendor_name text not null,
  item_description text,
  purchase_url text,
  quantity integer default 1,
  unit_price numeric default 0,
  notes text,
  custom_work_id uuid references custom_work(id) on delete set null,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  need_by_date date,
  attachments text[] default '{}',
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz default now()
);

-- Expenses
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  description text,
  amount numeric not null,
  category text,
  custom_work_id uuid references custom_work(id) on delete set null,
  vendor_name text,
  receipt_url text,
  notes text,
  created_at timestamptz default now()
);

-- Build Files (portal)
create table if not exists build_files (
  id uuid primary key default gen_random_uuid(),
  custom_work_id uuid references custom_work(id) on delete cascade not null,
  file_url text not null,
  file_name text,
  file_type text,
  label text,
  uploaded_by text,
  created_at timestamptz default now()
);

-- Build Comments (portal)
create table if not exists build_comments (
  id uuid primary key default gen_random_uuid(),
  custom_work_id uuid references custom_work(id) on delete cascade not null,
  author text not null,
  body text not null,
  is_change_request boolean default false,
  created_at timestamptz default now()
);

-- Approval Requests (portal)
create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  custom_work_id uuid references custom_work(id) on delete cascade not null,
  description text,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  client_notes text,
  responded_at timestamptz,
  created_at timestamptz default now()
);

-- Activity Log
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity text not null,
  entity_id uuid,
  label text,
  user_name text,
  meta jsonb default '{}',
  created_at timestamptz default now()
);

-- Log Archives
create table if not exists log_archives (
  id uuid primary key default gen_random_uuid(),
  label text,
  entries jsonb default '[]',
  entry_count integer default 0,
  archived_at timestamptz default now()
);

-- Enable RLS
alter table settings enable row level security;
alter table companies enable row level security;
alter table customers enable row level security;
alter table custom_work enable row level security;
alter table tasks enable row level security;
alter table invoices enable row level security;
alter table purchase_orders enable row level security;
alter table expenses enable row level security;
alter table build_files enable row level security;
alter table build_comments enable row level security;
alter table approval_requests enable row level security;
alter table activity_log enable row level security;
alter table log_archives enable row level security;

-- Authenticated users get full access
create policy "Auth full access" on settings for all to authenticated using (true) with check (true);
create policy "Auth full access" on companies for all to authenticated using (true) with check (true);
create policy "Auth full access" on customers for all to authenticated using (true) with check (true);
create policy "Auth full access" on custom_work for all to authenticated using (true) with check (true);
create policy "Auth full access" on tasks for all to authenticated using (true) with check (true);
create policy "Auth full access" on invoices for all to authenticated using (true) with check (true);
create policy "Auth full access" on purchase_orders for all to authenticated using (true) with check (true);
create policy "Auth full access" on expenses for all to authenticated using (true) with check (true);
create policy "Auth full access" on build_files for all to authenticated using (true) with check (true);
create policy "Auth full access" on build_comments for all to authenticated using (true) with check (true);
create policy "Auth full access" on approval_requests for all to authenticated using (true) with check (true);
create policy "Auth full access" on activity_log for all to authenticated using (true) with check (true);
create policy "Auth full access" on log_archives for all to authenticated using (true) with check (true);

-- Public (anon) access for portal
create policy "Portal read projects" on custom_work for select to anon using (portal_enabled = true);
create policy "Portal read files" on build_files for select to anon using (true);
create policy "Portal read comments" on build_comments for select to anon using (true);
create policy "Portal add comments" on build_comments for insert to anon with check (true);
create policy "Portal read approvals" on approval_requests for select to anon using (true);
create policy "Portal update approvals" on approval_requests for update to anon using (true) with check (true);
create policy "Portal read settings" on settings for select to anon using (true);
