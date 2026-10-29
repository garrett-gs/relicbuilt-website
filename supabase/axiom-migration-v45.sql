-- v45 — Brand logo library + per-document/email logo assignments.
--
-- A business can load several logos and pick which one (and at what width)
-- prints on each document and email (Purchase Orders, Invoices, Proposals,
-- Email). Shape stored in this JSONB column (Wallflower entity):
--   { "logos": [{ "id": "...", "url": "...", "label": "..." }],
--     "assignments": { "po": { "logo_id": "...", "width": 180 }, ... } }
-- The Relic entity stores the same object under relic_profile.branding, so it
-- needs no column of its own.
alter table settings add column if not exists branding jsonb;
