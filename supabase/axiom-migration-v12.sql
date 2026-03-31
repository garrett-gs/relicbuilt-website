-- Migration v12: Notepad for Tasks page

create table if not exists task_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled Note',
  content text default '',
  folder text,
  is_filed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
