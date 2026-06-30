-- v25: add the denormalized customers.company_name that the estimator's
-- customer search reads and filters on. It was never created, so the search
-- query ("...select id,name,email,phone,company_name...") errored out and
-- picking a customer failed to transfer their email/phone onto the estimate.
--
-- We backfill from the linked company and keep it in sync with triggers, so no
-- application code has to maintain it.

alter table customers add column if not exists company_name text;

-- Backfill existing contacts from their linked company.
update customers
  set company_name = co.name
  from companies co
  where customers.company_id = co.id
    and customers.company_name is distinct from co.name;

-- Whenever a customer's company link changes, refresh the cached name.
create or replace function sync_customer_company_name()
returns trigger as $$
begin
  if new.company_id is null then
    new.company_name := null;
  else
    select name into new.company_name from companies where id = new.company_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_customer_company_name on customers;
create trigger trg_sync_customer_company_name
  before insert or update of company_id on customers
  for each row execute function sync_customer_company_name();

-- When a company is renamed, propagate the new name to all its contacts.
create or replace function propagate_company_name()
returns trigger as $$
begin
  if new.name is distinct from old.name then
    update customers set company_name = new.name where company_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_propagate_company_name on companies;
create trigger trg_propagate_company_name
  after update of name on companies
  for each row execute function propagate_company_name();
