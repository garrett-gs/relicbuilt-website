-- v30: extend business-entity tagging (see v29) to the CRM. Customers and
-- companies added on the Relic side stay on the Relic side — existing rows
-- default to 'wallflower_relic'.

alter table customers add column if not exists entity text not null default 'wallflower_relic';
alter table companies add column if not exists entity text not null default 'wallflower_relic';

create index if not exists customers_entity_idx on customers (entity);
create index if not exists companies_entity_idx on companies (entity);
