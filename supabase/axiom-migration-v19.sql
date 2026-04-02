-- v19: Add proposal scope and cost section to custom_work
alter table custom_work add column if not exists proposal_scope jsonb;
alter table custom_work add column if not exists proposal_cost_section jsonb;
