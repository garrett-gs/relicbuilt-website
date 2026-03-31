-- Migration v10: Business address in settings, reference number on invoices
alter table settings
  add column if not exists biz_address text,
  add column if not exists biz_city text,
  add column if not exists biz_state text,
  add column if not exists biz_zip text;

alter table invoices
  add column if not exists reference_number text,
  add column if not exists client_phone text;
