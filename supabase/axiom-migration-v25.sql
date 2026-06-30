-- v25: add the denormalized customers.company_name that the estimator's
-- customer search reads and filters on. It was never created, so the search
-- query ("...select id,name,email,phone,company_name...") errored and picking
-- a customer failed to transfer their email/phone onto the estimate.
--
-- The column is kept in sync going forward by the application code (contact
-- creation, company rename, and the Wallflower sync all set it) rather than DB
-- triggers, so this migration is just the column plus a one-time backfill.

alter table customers add column if not exists company_name text;

update customers
  set company_name = co.name
  from companies co
  where customers.company_id = co.id;
