-- v53: Relic numbering. The custom_work record is surfaced in the UI as a
-- "Relic" (one folder per piece of work). This adds a human-facing identifier
-- REL-#### (e.g. REL-1042), assigned at creation and shown on cards, the Relic
-- header, and the estimates/POs/invoices generated inside it.
--
-- UI-labels-first: the table stays `custom_work`; only a new column is added.
-- Idempotent — safe to re-run.

alter table public.custom_work
  add column if not exists relic_number text;

-- Fast "next number" lookup and uniqueness guard for the REL-#### sequence.
create index if not exists custom_work_relic_number_idx on public.custom_work (relic_number);

-- Backfill: give every existing Relic (custom_work row) a number so the board
-- isn't half-numbered. Numbers continue from the current max (or 1041, so the
-- first is REL-1042, matching the design). Only fills NULLs, so it is safe to
-- re-run and never renumbers a row that already has one.
with ordered as (
  select id, row_number() over (order by created_at) as rn
  from public.custom_work
  where relic_number is null
),
base as (
  select coalesce(max(cast(split_part(relic_number, '-', 2) as int)), 1041) as m
  from public.custom_work
  where relic_number like 'REL-%'
)
update public.custom_work c
set relic_number = 'REL-' || lpad((base.m + o.rn)::text, 4, '0')
from ordered o, base
where c.id = o.id;
