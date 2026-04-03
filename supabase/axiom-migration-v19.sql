-- v19: Add proposal scope, cost section, and images toggle to custom_work
alter table custom_work add column if not exists proposal_scope jsonb;
alter table custom_work add column if not exists proposal_cost_section jsonb;
alter table custom_work add column if not exists proposal_images_included boolean default true;
