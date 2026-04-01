-- v14: Company client portal token
alter table companies add column if not exists portal_token text unique;
alter table companies add column if not exists portal_enabled boolean default false;
