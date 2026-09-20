-- v37: Read-only share tokens for the Build Calendar, per entity.
-- Shape: { "wallflower_relic": "cal_xxx", "relic": "cal_yyy" }. A token grants
-- read-only access to that entity's build calendar via /calendar/<token>.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS calendar_share_tokens jsonb NOT NULL DEFAULT '{}'::jsonb;
