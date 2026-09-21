-- v38: Notes — an internal running notebook (e.g. pasted call summaries from
-- Granola). Each note lives on the entity that created it and is PRIVATE to
-- that side by default. A per-note `shared` flag also surfaces the note on the
-- OTHER Axiom side (Wallflower <-> Relic). Notes are internal only — never
-- exposed to Nexus or the customer-facing portal.
CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL DEFAULT 'wallflower_relic',
  title text,
  body text,
  shared boolean NOT NULL DEFAULT false,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  custom_work_id uuid REFERENCES custom_work(id) ON DELETE SET NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Read: your own side's notes, PLUS any note the other side marked `shared`,
-- PLUS everything for members with Relic access (superadmin / relic_access).
DROP POLICY IF EXISTS "notes_select" ON notes;
CREATE POLICY "notes_select" ON notes FOR SELECT TO authenticated
  USING ( entity = 'wallflower_relic' OR shared = true OR public.has_relic_access() );

-- Write (insert / update / delete): only your own side, unless you have Relic
-- access. This lets a Wallflower-only user SEE a shared Relic note but not
-- edit or delete it — the owning side keeps control of it.
DROP POLICY IF EXISTS "notes_write" ON notes;
CREATE POLICY "notes_write" ON notes FOR ALL TO authenticated
  USING ( entity = 'wallflower_relic' OR public.has_relic_access() )
  WITH CHECK ( entity = 'wallflower_relic' OR public.has_relic_access() );

CREATE INDEX IF NOT EXISTS notes_entity_idx ON notes (entity);
CREATE INDEX IF NOT EXISTS notes_customer_idx ON notes (customer_id);
