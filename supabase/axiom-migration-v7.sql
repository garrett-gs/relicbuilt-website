-- Migration v7: Time entries table

create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  member_name text not null,
  custom_work_id uuid references custom_work(id) on delete set null,
  project_name text,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  hours numeric,
  hourly_rate numeric default 60,
  notes text,
  created_at timestamptz default now()
);

alter table time_entries enable row level security;
create policy "Auth full access" on time_entries for all to authenticated using (true) with check (true);
-- Time clock is public-accessible (no auth on that page)
create policy "Anon full access" on time_entries for all to anon using (true) with check (true);
