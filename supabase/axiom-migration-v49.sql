-- v49 — Internal-client identity + record-only labor bill (Stage 2).
--
-- Stage 2 of the Wallflower-Hub merge. Two additive, nullable columns:
--
--  settings.internal_client_profile (jsonb) — the back-of-house identity for a
--    workspace's one internal client (e.g. Wallflower RELIC): { name, logo_url,
--    labor_rate }. The branded end-customer build document reads name + logo_url;
--    record-only labor bills read labor_rate ($/hr). The RELIC entity's copy
--    lives in the relic_profile JSONB blob and needs no column (mirrors
--    nexus_connected / internal_client_enabled, v48).
--
--  wallflower_work_orders.labor_bill (jsonb) — a record-only labor bill derived
--    from an order's logged hours × the flat shop rate, numbered as a child of
--    the order's Nexus number (e.g. WF-8832-L1): { number, hours, rate, total,
--    created_at, created_by }. No pay rail — a reference for the internal client.
--
-- Both nullable/additive, so existing rows are unaffected. Apply before this
-- branch deploys (the v48 lesson: migration runs before deploy).
alter table settings add column if not exists internal_client_profile jsonb;
alter table wallflower_work_orders add column if not exists labor_bill jsonb;
