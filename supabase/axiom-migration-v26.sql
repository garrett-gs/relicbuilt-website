-- v26: let an Axiom work order reference a Wallflower RELIC Nexus order/quote.
-- Stored as jsonb: { type: 'order'|'quote', id, number, client_name, event_date }.

alter table wallflower_work_orders add column if not exists nexus_ref jsonb;
