-- v31: per-entity business identity for the "Relic" entity (Phase 2). The
-- Wallflower RELIC profile continues to come from the existing biz_* columns
-- on settings; the Relic profile lives in a single JSONB blob so invoice/PO/
-- proposal templates and outbound email can brand Relic documents separately.
-- Shape: { name, email, phone, address, city, state, zip, website, logo_url,
--          footer, from_name, from_email }

alter table settings add column if not exists relic_profile jsonb;
