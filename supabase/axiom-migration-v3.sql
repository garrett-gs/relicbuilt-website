-- Migration v3: Add company_id FK to custom_work

alter table custom_work
  add column if not exists company_id uuid references companies(id) on delete set null;
