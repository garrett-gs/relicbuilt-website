-- Migration v4: Estimates table

create table if not exists estimates (
  id uuid primary key default gen_random_uuid(),
  estimate_number text unique not null,
  project_name text,
  custom_work_id uuid references custom_work(id) on delete set null,
  client_name text,
  status text default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  line_items jsonb default '[]',
  labor_items jsonb default '[]',
  markup_percent numeric default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table estimates enable row level security;
create policy "Auth full access" on estimates for all to authenticated using (true) with check (true);
