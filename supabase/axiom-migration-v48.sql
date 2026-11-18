-- v48 — Internal-client capability flag (per workspace).
--
-- Promotes the ad-hoc customers.internal checkbox into a gated "client type":
-- this flag turns the capability on for the workspace so one client can be set
-- to the Internal type (billed at cost, work orders, Nexus bridge — e.g.
-- Wallflower RELIC). Off by default = opt-in. The RELIC entity's copy lives in
-- the relic_profile JSONB blob and needs no column. Mirrors nexus_connected;
-- resolved in EntityProvider with the INTERNAL_CLIENT_ENABLED env as fallback.
alter table settings add column if not exists internal_client_enabled boolean not null default false;
