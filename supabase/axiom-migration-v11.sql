-- Migration v11: Add proposal highlights and images to custom_work

alter table custom_work
  add column if not exists proposal_highlights jsonb default '[]'::jsonb,
  add column if not exists proposal_images jsonb default '[]'::jsonb;
