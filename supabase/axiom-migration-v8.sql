-- Migration v8: Delivery fields on purchase_orders

alter table purchase_orders
  add column if not exists delivery_method text check (delivery_method in ('pickup', 'will_call', 'ship')),
  add column if not exists delivery_date date,
  add column if not exists ship_to_address text;
