-- Migration v42: time-entry approval (Crew → Time Logs)
--
-- Adds admin sign-off to completed clock entries so a manager can confirm the
-- times are accurate. Editing an entry in Crew → Time Logs clears approval so
-- the new numbers get re-signed.

alter table time_entries
  add column if not exists approved boolean not null default false,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz;
