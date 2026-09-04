-- v28: time & material tracking on Wallflower work orders, mirroring the
-- Projects (custom_work) model. Materials and the labor log live as JSONB
-- arrays on the work-order row, with a rolled-up actual_cost. active_clock
-- holds an in-progress clock ({ member_name, hourly_rate, clock_in }) between
-- a clock-in and clock-out; it is cleared once the finished entry is appended
-- to labor_log.

alter table wallflower_work_orders add column if not exists materials    jsonb   not null default '[]'::jsonb;
alter table wallflower_work_orders add column if not exists labor_log     jsonb   not null default '[]'::jsonb;
alter table wallflower_work_orders add column if not exists actual_cost   numeric not null default 0;
alter table wallflower_work_orders add column if not exists active_clock  jsonb;
