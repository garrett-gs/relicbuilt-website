-- Migration v9: Add line_items to invoices
alter table invoices
  add column if not exists line_items jsonb default '[]'::jsonb;
