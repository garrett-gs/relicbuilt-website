-- v34: Mark when a purchase order was received into the catalog, so it can't
-- be silently received twice (which would double-count quantities/costs).
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_at timestamptz;
