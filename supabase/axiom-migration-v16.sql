-- receipts table
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  image_url text,
  vendor text,
  receipt_date date,
  total numeric,
  line_items jsonb default '[]',
  project_id uuid,
  project_name text,
  notes text,
  created_at timestamptz default now()
);

-- Storage bucket for receipt images
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;
