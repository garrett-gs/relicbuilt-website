-- v47 — Venmo as a payment option on the public Pay page.
--
-- Stores the Wallflower/default entity's Venmo handle. (Relic's handle lives
-- in the relic_profile JSONB blob and needs no column.) When set, the Pay
-- page offers a "Venmo" method alongside ACH and Credit Card: the customer
-- pays the handle directly (no Stripe, no processing fee) and we record the
-- payment manually from the Invoices page, where "Venmo" is already a method.
alter table settings add column if not exists venmo_handle text;
