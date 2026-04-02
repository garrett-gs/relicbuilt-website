-- Add checklist column to custom_work
alter table custom_work add column if not exists checklist jsonb default '{}';
