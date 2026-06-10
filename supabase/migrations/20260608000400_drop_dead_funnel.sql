-- Step 4 cleanup: remove the dead sales funnel and the legacy sensitive
-- client columns.
--
-- Context: the granular funnel (sales_lead → contact_attempt → appointment →
-- presentation → sale → issued_policy → deposit) was a port of the old LifeLeads
-- schema. The app never wrote to it; dashboards/analytics now read the real
-- data producers enter (clients + client_deposits + tracker_entry). The Agency
-- app does not touch these tables. All rows were demo/seed data (no real users
-- yet), so this is non-destructive to any real production data.
--
-- appointment / presentation / motivational_video were already empty.

-- Drop the funnel tables. CASCADE clears the FK chain
-- (deposit → issued_policy → sale → presentation/appointment → sales_lead) and
-- the matching RLS policies/indexes in one shot.
drop table if exists deposit          cascade;
drop table if exists issued_policy    cascade;
drop table if exists sale             cascade;
drop table if exists presentation     cascade;
drop table if exists appointment      cascade;
drop table if exists contact_attempt  cascade;
drop table if exists sales_lead       cascade;
drop table if exists motivational_video cascade;

-- Drop the legacy sensitive client columns. These were removed from the app UI
-- in favor of the new private_notes field; they only ever held nulls.
alter table clients
  drop column if exists ssn,
  drop column if exists payment_method,
  drop column if exists bank_name,
  drop column if exists routing_number,
  drop column if exists account_number,
  drop column if exists cc_name,
  drop column if exists cc_number,
  drop column if exists cc_expiry,
  drop column if exists cc_cvv;
