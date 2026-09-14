-- v33: Job-site address on estimates (for the proposal's Project block).
-- site_same_as_client true (default) => proposal uses the client's address;
-- false => it shows site_address. Idempotent.

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS site_address text;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS site_same_as_client boolean NOT NULL DEFAULT true;
