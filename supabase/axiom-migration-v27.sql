-- v27: let a Purchase Order be assigned to a Wallflower work order. The project
-- (custom_work_id, used for inventory allocation) is derived automatically from
-- the work order's estimate, so it's no longer picked manually.

alter table purchase_orders add column if not exists work_order_id uuid references wallflower_work_orders(id) on delete set null;
