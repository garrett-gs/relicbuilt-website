-- Migration v13: Unified customers (companies + individuals + contacts)

-- Allow 'Contact' as a customer type (drop the check constraint)
alter table customers drop constraint if exists customers_type_check;

-- Add title (job title) to customers for contacts
alter table customers add column if not exists title text;

-- Add phone and website to companies
alter table companies add column if not exists phone text;
alter table companies add column if not exists website text;
