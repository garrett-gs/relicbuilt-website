-- v21: Proposal approval workflow
alter table custom_work add column if not exists proposal_token text;
alter table custom_work add column if not exists proposal_status text default 'draft';
alter table custom_work add column if not exists proposal_approved_at timestamptz;
alter table invoices add column if not exists invoice_type text default 'standard';
