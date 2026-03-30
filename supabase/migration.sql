-- Relic Built Database Schema
-- Run this in your Supabase SQL Editor

-- Projects (Portfolio)
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text,
  category text not null check (category in ('woodworking', 'metalworking', 'mixed')),
  tags text[] default '{}',
  images text[] default '{}',
  featured boolean default false,
  created_at timestamptz default now()
);

-- Products (Shop)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  price integer not null,
  images text[] default '{}',
  specs jsonb default '{}',
  stock integer default 0,
  available boolean default true,
  stripe_price_id text,
  created_at timestamptz default now()
);

-- Availability (Scheduling)
create table if not exists availability (
  id uuid primary key default gen_random_uuid(),
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean default true
);

-- Bookings (Appointments)
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_email text not null,
  client_phone text,
  date date not null,
  start_time time not null,
  end_time time not null,
  notes text,
  status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz default now()
);

-- Client Inquiries (Contact & New Client Forms)
create table if not exists client_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text,
  message text,
  project_type text,
  budget_range text,
  timeline text,
  form_type text default 'contact' check (form_type in ('contact', 'new-client')),
  created_at timestamptz default now()
);

-- Orders (E-commerce)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique,
  customer_email text,
  items jsonb not null default '[]',
  total integer not null,
  status text default 'pending' check (status in ('pending', 'paid', 'fulfilled', 'cancelled')),
  created_at timestamptz default now()
);

-- Row Level Security
alter table projects enable row level security;
alter table products enable row level security;
alter table availability enable row level security;
alter table bookings enable row level security;
alter table client_inquiries enable row level security;
alter table orders enable row level security;

-- Public read access for projects
create policy "Public can view projects"
  on projects for select
  to anon
  using (true);

-- Public read access for products
create policy "Public can view products"
  on products for select
  to anon
  using (true);

-- Public read access for availability
create policy "Public can view availability"
  on availability for select
  to anon
  using (is_active = true);

-- Public can create bookings
create policy "Public can create bookings"
  on bookings for insert
  to anon
  with check (true);

-- Public can create inquiries
create policy "Public can create inquiries"
  on client_inquiries for insert
  to anon
  with check (true);

-- Seed default availability (Monday-Friday, 9am-5pm)
insert into availability (day_of_week, start_time, end_time, is_active) values
  (1, '09:00', '17:00', true),
  (2, '09:00', '17:00', true),
  (3, '09:00', '17:00', true),
  (4, '09:00', '17:00', true),
  (5, '09:00', '17:00', true);
