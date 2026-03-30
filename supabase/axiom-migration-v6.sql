-- Migration v6: Add vendor_id and vendor_name to estimates

alter table estimates
  add column if not exists vendor_id uuid references vendors(id) on delete set null,
  add column if not exists vendor_name text;
