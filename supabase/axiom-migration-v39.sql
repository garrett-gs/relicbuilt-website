-- v39: Master Projects — a parent level above estimates/builds. Multiple
-- estimates (each its own build) roll up under one master project, e.g.
-- "CHI Western" over Bar / Back Bar / Facades. Entity-scoped like everything
-- else. Estimates and their resulting custom_work rows carry an optional
-- master_project_id; tagging the estimate flows through to the built project.
CREATE TABLE IF NOT EXISTS master_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL DEFAULT 'wallflower_relic',
  name text NOT NULL,
  client_name text,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  site_address text,
  description text,
  status text NOT NULL DEFAULT 'active',   -- active | complete | archived
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE master_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Entity access" ON master_projects;
CREATE POLICY "Entity access" ON master_projects FOR ALL TO authenticated
  USING ( entity = 'wallflower_relic' OR public.has_relic_access() )
  WITH CHECK ( entity = 'wallflower_relic' OR public.has_relic_access() );

ALTER TABLE estimates   ADD COLUMN IF NOT EXISTS master_project_id uuid REFERENCES master_projects(id) ON DELETE SET NULL;
ALTER TABLE custom_work  ADD COLUMN IF NOT EXISTS master_project_id uuid REFERENCES master_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS estimates_master_idx   ON estimates (master_project_id);
CREATE INDEX IF NOT EXISTS custom_work_master_idx ON custom_work (master_project_id);
CREATE INDEX IF NOT EXISTS master_projects_entity_idx ON master_projects (entity);
