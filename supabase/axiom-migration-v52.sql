-- v52: Notes can attach to a quote or an order, not just a project or a client.
--
-- The notes table already carries customer_id (a client) and custom_work_id (a
-- build/project). This adds the two remaining attach targets so a note can be
-- tagged to a Nexus quote request / estimate (estimate_id) or a work order
-- (work_order_id), mirroring the existing explicit-FK pattern. A note attaches
-- to at most one record; all columns stay nullable. Idempotent — safe to re-run.

alter table public.notes
  add column if not exists estimate_id uuid,
  add column if not exists work_order_id uuid;

-- Fast lookup of "notes attached to this record" for the record-side panel.
create index if not exists notes_estimate_id_idx   on public.notes (estimate_id);
create index if not exists notes_work_order_id_idx  on public.notes (work_order_id);
create index if not exists notes_custom_work_id_idx on public.notes (custom_work_id);
create index if not exists notes_customer_id_idx    on public.notes (customer_id);
