-- v40: Wallflower work-order billing posture
--
-- Nexus now marks some inbound work requests as "maintenance" (internal upkeep
-- they eat the cost on — no customer-facing price). This column records that
-- posture so the Axiom estimator knows to track cost only and not quote.
-- Defaults to 'billable' so every existing and future row behaves exactly as
-- before unless Nexus explicitly sends billing_type = 'maintenance'.

alter table wallflower_work_orders
  add column if not exists billing_type text not null default 'billable';
