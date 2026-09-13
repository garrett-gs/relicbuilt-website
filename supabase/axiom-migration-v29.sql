-- v29: business-entity tagging so a separate "Relic" entity can run inside
-- Axiom alongside Wallflower RELIC. Every existing/new record defaults to
-- 'wallflower_relic'; rows tagged 'relic' are shown only to team members
-- granted Relic access. Phase 1 gates visibility in the UI (see the
-- relic_access flag added to settings.team_members); DB-enforced privacy
-- (RLS) is a later phase.

alter table custom_work     add column if not exists entity text not null default 'wallflower_relic';
alter table estimates       add column if not exists entity text not null default 'wallflower_relic';
alter table invoices        add column if not exists entity text not null default 'wallflower_relic';
alter table purchase_orders add column if not exists entity text not null default 'wallflower_relic';
alter table expenses        add column if not exists entity text not null default 'wallflower_relic';

-- Fast lookups when filtering a list by entity.
create index if not exists custom_work_entity_idx     on custom_work (entity);
create index if not exists estimates_entity_idx       on estimates (entity);
create index if not exists invoices_entity_idx        on invoices (entity);
create index if not exists purchase_orders_entity_idx on purchase_orders (entity);
create index if not exists expenses_entity_idx        on expenses (entity);
