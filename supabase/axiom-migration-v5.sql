-- Migration v5: Add customer_id FK to estimates

alter table estimates
  add column if not exists customer_id uuid references customers(id) on delete set null;
