-- v35: Client-facing document attachments on estimate proposals.
-- Array of { name, url } — PDFs/spec sheets/etc. shown as download links on
-- the proposal. Idempotent.
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS proposal_documents jsonb NOT NULL DEFAULT '[]'::jsonb;
