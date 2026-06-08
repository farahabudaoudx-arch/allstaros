-- Lead spend tracking: one row per batch of leads a producer buys.
-- Modeled on the clients/client_deposits tables — scoped to a person, with
-- person_id defaulting to auth_person_id() so the browser anon client can
-- insert without knowing the acting person's id (RLS pins it).
--
-- Read = can_view(person_id) (self + downline + owner). Write = self only.

create table if not exists lead_purchases (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null default auth_person_id() references person(id) on delete cascade,

  vendor text not null default '',        -- where the leads were bought from
  amount numeric not null default 0,       -- total cash spent on this batch
  lead_count integer not null default 0,   -- how many leads in the batch
  lead_type text,                          -- e.g. Final Expense, Mortgage Protection
  purchase_date date,                      -- date the leads were bought
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lead_purchases_person_date_idx
  on lead_purchases(person_id, purchase_date desc);

drop trigger if exists lead_purchases_updated_at on lead_purchases;
create trigger lead_purchases_updated_at
  before update on lead_purchases
  for each row execute function set_updated_at();

alter table lead_purchases enable row level security;

drop policy if exists "lead_purchases: read" on lead_purchases;
create policy "lead_purchases: read" on lead_purchases for select using (can_view(person_id));
drop policy if exists "lead_purchases: write" on lead_purchases;
create policy "lead_purchases: write" on lead_purchases for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());
