-- Clients book-of-business + deposit tracking.
-- Ported from the LifeLeads app's clients feature. LifeLeads scoped every row
-- to auth.uid() (user_id); All Star OS scopes to a person, so both tables key
-- off person_id referencing person(id). person_id defaults to auth_person_id()
-- so browser-side inserts (the client form / deposits panel write directly via
-- the anon client) don't have to know the acting person's id — RLS pins it.
--
-- Read = can_view(person_id) (self + downline + owner, same as the producer
-- sales tables). Write = self only via auth_person_id().
--
-- NOTE: these tables hold sensitive PII (SSN, bank routing/account numbers,
-- card number/expiry/CVV). RLS is the only thing standing between producers'
-- books — every policy below is owner-scoped on write.

-- ---------------------------------------------------------------------------
-- clients: one row per client/policy a producer has written
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null default auth_person_id() references person(id) on delete cascade,

  client_name text not null default '',
  date date,
  ssn text,
  dob date,
  age integer,
  phone text,
  smoker boolean not null default false,
  email text,
  address text,
  city text,
  state text,
  postal_code text,
  height_weight text,
  medical_notes text,

  lead_vendor text,
  lead_type text,
  lead_age text,
  field_or_tele text,
  appointment_type text,

  policy_number text,
  submit_date date,
  first_draft_date date,
  payor_name text,
  issue_date date,
  monthly_payment_date text,
  policy_notes text,

  payment_method text not null default 'bank_draft'
    check (payment_method in ('bank_draft','credit_card')),
  bank_name text,
  routing_number text,
  account_number text,
  cc_name text,
  cc_number text,
  cc_expiry text,
  cc_cvv text,

  quotes jsonb not null default '[]'::jsonb,
  chosen_quote_index integer default 0,

  annual_premium numeric,
  product_comp_pct numeric not null default 140,
  advance_type text not null default '75_9mo',
  sale_status text not null default 'sale'
    check (sale_status in ('in_progress','missed','sale')),
  is_primary_client boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_person_updated_idx
  on clients(person_id, updated_at desc);
create index if not exists clients_person_status_idx
  on clients(person_id, sale_status);

drop trigger if exists clients_updated_at on clients;
create trigger clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- client_deposits: the deposit state (pending/successful/failed) + amounts
-- for a client's first issued draft. One effective row per client.
-- ---------------------------------------------------------------------------
create table if not exists client_deposits (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null default auth_person_id() references person(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  issue_date date,
  estimated_amount numeric,
  actual_amount numeric,
  status text not null default 'pending'
    check (status in ('pending','successful','failed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_deposits_person_idx
  on client_deposits(person_id);
create index if not exists client_deposits_client_idx
  on client_deposits(client_id);

drop trigger if exists client_deposits_updated_at on client_deposits;
create trigger client_deposits_updated_at
  before update on client_deposits
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table clients         enable row level security;
alter table client_deposits enable row level security;

drop policy if exists "clients: read" on clients;
create policy "clients: read" on clients for select using (can_view(person_id));
drop policy if exists "clients: write" on clients;
create policy "clients: write" on clients for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "client_deposits: read" on client_deposits;
create policy "client_deposits: read" on client_deposits for select using (can_view(person_id));
drop policy if exists "client_deposits: write" on client_deposits;
create policy "client_deposits: write" on client_deposits for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());
