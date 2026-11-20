-- v50: client + event context columns on wallflower_work_orders.
--
-- The Stage 2c intake route (POST /api/wallflower, shipped in 41d219e) writes
-- these, and the Wallflower Hub, estimate-from-work-order, and the
-- WallflowerWorkOrder type read them — carrying the end-customer + event
-- details from the Nexus quote/order through estimate → proposal → project →
-- invoice. The route update shipped WITHOUT this migration, so every intake
-- insert hit "column does not exist" (42703) and returned the generic 500
-- "Failed to create work order" (the v48 lesson: migrate before deploy).
--
-- All columns are nullable text (event_date is a string on our side, matching
-- the type), so this is additive and safe to run on the live DB.

alter table public.wallflower_work_orders
  add column if not exists client_name    text,
  add column if not exists client_email   text,
  add column if not exists client_phone   text,
  add column if not exists client_company text,
  add column if not exists event_date     text,
  add column if not exists venue          text,
  add column if not exists occasion       text;
