-- Migration v44: internal companies
--
-- Mirrors customers.internal (v43) for the Companies list, so the shop's own
-- business can be flagged + badged "Internal" whether it's tracked as a
-- customer or a company.

alter table companies
  add column if not exists internal boolean not null default false;
