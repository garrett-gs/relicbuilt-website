-- Migration v43: internal customers
--
-- Marks a customer as the shop's own business (e.g. "Wallflower RELIC —
-- internal"). When an estimate is for an internal customer, "Send to Nexus"
-- takes the internal path: no client proposal / sign-off portal, priced at
-- cost (no markup), and the build's cost lands as WR project spend only.

alter table customers
  add column if not exists internal boolean not null default false;
