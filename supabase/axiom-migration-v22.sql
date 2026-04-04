-- Axiom v22: Inventory Management System

-- Inventory Categories
CREATE TABLE IF NOT EXISTS inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  subcategories text[] DEFAULT '{}',
  color text DEFAULT '#6b7280',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Inventory Items (linked to vendor_catalog)
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid REFERENCES vendor_catalog(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  category_id uuid REFERENCES inventory_categories(id) ON DELETE SET NULL,
  item_number text,
  description text NOT NULL,
  unit text DEFAULT 'ea',
  unit_cost numeric DEFAULT 0,
  quantity_on_hand numeric DEFAULT 0,
  min_stock_level numeric DEFAULT 0,
  location text,
  notes text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Inventory Transactions
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('in', 'out', 'adjustment')),
  quantity numeric NOT NULL,
  unit_cost numeric DEFAULT 0,
  custom_work_id uuid,
  notes text,
  date date NOT NULL DEFAULT current_date,
  created_by text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inv_items_category ON inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_item ON inventory_transactions(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_date ON inventory_transactions(date DESC);

-- RLS
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth full access" ON inventory_categories FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (true);

CREATE POLICY "Auth full access" ON inventory_items FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (true);

CREATE POLICY "Auth full access" ON inventory_transactions FOR ALL
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (true);

-- Auto-sync: when a vendor_catalog row is inserted, create inventory_items row
CREATE OR REPLACE FUNCTION sync_catalog_to_inventory()
RETURNS trigger AS $$
BEGIN
  INSERT INTO inventory_items (catalog_item_id, vendor_id, item_number, description, unit, unit_cost)
  VALUES (NEW.id, NEW.vendor_id, NEW.item_number, NEW.description, NEW.unit, NEW.unit_price);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_catalog_insert_sync
AFTER INSERT ON vendor_catalog
FOR EACH ROW EXECUTE FUNCTION sync_catalog_to_inventory();

-- Auto-sync: when vendor_catalog is updated, update matching inventory_items
CREATE OR REPLACE FUNCTION sync_catalog_update_to_inventory()
RETURNS trigger AS $$
BEGIN
  UPDATE inventory_items
  SET item_number = NEW.item_number,
      description = NEW.description,
      unit = NEW.unit,
      unit_cost = NEW.unit_price,
      updated_at = now()
  WHERE catalog_item_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_catalog_update_sync
AFTER UPDATE ON vendor_catalog
FOR EACH ROW EXECUTE FUNCTION sync_catalog_update_to_inventory();

-- Backfill: create inventory items for existing catalog entries
INSERT INTO inventory_items (catalog_item_id, vendor_id, item_number, description, unit, unit_cost)
SELECT id, vendor_id, item_number, description, unit, unit_price
FROM vendor_catalog
WHERE active = true
ON CONFLICT DO NOTHING;

-- Seed the three default categories
INSERT INTO inventory_categories (name, description, subcategories, color, sort_order) VALUES
  ('Consumables', 'Glue, nails, staples, sandpaper, screws, etc.', '{"Glue","Nails","Staples","Sandpaper","Screws","Tape","Finishes"}', '#f59e0b', 1),
  ('Wood', 'Lumber, plywood, sheet goods, specialty wood', '{"Hardwood","Softwood","Plywood","Sheet Goods","Specialty","Veneer"}', '#22c55e', 2),
  ('Hardware', 'Hinges, slides, knobs, pulls, fasteners', '{"Hinges","Slides","Knobs","Pulls","Fasteners","Brackets","Locks"}', '#3b82f6', 3);
