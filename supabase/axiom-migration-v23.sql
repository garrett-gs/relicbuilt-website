-- Axiom v23: Wallflower work-order reference images
--
-- Wallflower's send-to-RELIC payload now includes the item photo
-- (item_image_url) and an array of reference / inspiration images
-- (reference_images). Previously the /api/wallflower route dropped both
-- because they weren't destructured/stored. Add columns to keep them.
--
-- Non-destructive: existing rows get NULL for item_image_url and [] for
-- reference_images. Images themselves stay on Wallflower's public storage —
-- we only store the URLs.
--
-- reference_images shape — jsonb array of:
--   { url: string, name: string, uploaded_at: string (ISO) }

ALTER TABLE public.wallflower_work_orders
  ADD COLUMN IF NOT EXISTS item_image_url text,
  ADD COLUMN IF NOT EXISTS reference_images jsonb NOT NULL DEFAULT '[]'::jsonb;
