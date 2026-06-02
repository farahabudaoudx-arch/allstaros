-- Producer sales-tracking tables.
-- Ported from the LifeLeads app's closed-loop schema
-- (lead → contact → appointment → presentation → sale → policy → deposit,
-- plus per-day activity totals in tracker_entry) so the producer dashboard
-- and analytics view can render real numbers.
--
-- LifeLeads scoped everything to an agency `account_id` + acting `agent_id`.
-- In All Star OS each producer IS a person, so every table is scoped to a
-- single `person_id` referencing person(id). Visibility reuses the existing
-- can_view() helper: a producer sees their own rows, an upline sees their
-- downline's rows, and an owner sees everyone. Writes are pinned to the
-- acting person via auth_person_id().

-- ---------------------------------------------------------------------------
-- sales_lead: an inbound insurance lead worked by a producer
-- ---------------------------------------------------------------------------
create table if not exists sales_lead (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  state text,
  age integer,
  received_at timestamptz not null default now()
);
create index if not exists sales_lead_person_received_idx
  on sales_lead(person_id, received_at desc);
create index if not exists sales_lead_person_state_idx
  on sales_lead(person_id, state);

-- ---------------------------------------------------------------------------
-- contact_attempt: one row per dial attempted against a lead
-- ---------------------------------------------------------------------------
create table if not exists contact_attempt (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  lead_id uuid not null references sales_lead(id) on delete cascade,
  outcome text not null check (outcome in (
    'connected','voicemail','no_answer','wrong_number','dnc','disconnected','callback'
  )),
  duration_sec integer not null default 0 check (duration_sec >= 0),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists contact_attempt_person_created_idx
  on contact_attempt(person_id, created_at desc);
create index if not exists contact_attempt_lead_idx
  on contact_attempt(lead_id);

-- ---------------------------------------------------------------------------
-- appointment: a scheduled meeting with a lead
-- ---------------------------------------------------------------------------
create table if not exists appointment (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  lead_id uuid not null references sales_lead(id) on delete cascade,
  scheduled_for timestamptz not null,
  showed boolean,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists appointment_person_scheduled_idx
  on appointment(person_id, scheduled_for desc);
create index if not exists appointment_lead_idx
  on appointment(lead_id);

-- ---------------------------------------------------------------------------
-- presentation: a sales presentation given (usually after an appointment)
-- ---------------------------------------------------------------------------
create table if not exists presentation (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  appointment_id uuid references appointment(id) on delete set null,
  lead_id uuid not null references sales_lead(id) on delete cascade,
  outcome text not null check (outcome in (
    'closed','objected','thinking','no_show','other'
  )),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists presentation_person_created_idx
  on presentation(person_id, created_at desc);
create index if not exists presentation_lead_idx
  on presentation(lead_id);

-- ---------------------------------------------------------------------------
-- sale: a closed sale. Total AP = sum(annual_premium_cents).
-- ---------------------------------------------------------------------------
create table if not exists sale (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  presentation_id uuid references presentation(id) on delete set null,
  lead_id uuid not null references sales_lead(id) on delete cascade,
  carrier text not null,
  face_amount_cents integer not null check (face_amount_cents >= 0),
  monthly_premium_cents integer not null check (monthly_premium_cents >= 0),
  annual_premium_cents integer not null check (annual_premium_cents >= 0),
  beneficiary_name text,
  effective_date date,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists sale_person_created_idx
  on sale(person_id, created_at desc);
create index if not exists sale_person_carrier_idx
  on sale(person_id, carrier);
create index if not exists sale_lead_idx
  on sale(lead_id);

-- ---------------------------------------------------------------------------
-- issued_policy: a sale the carrier actually issued. Total IP = sum of the
-- joined sale.annual_premium_cents where status in ('issued','lapsed').
-- (Named issued_policy to avoid the POLICY keyword and the existing
-- policy_submission table.)
-- ---------------------------------------------------------------------------
create table if not exists issued_policy (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  sale_id uuid not null unique references sale(id) on delete cascade,
  policy_number text,
  status text not null default 'issued' check (status in (
    'issued','declined','cancelled','lapsed'
  )),
  issued_at timestamptz not null default now(),
  cancelled_at timestamptz,
  notes text
);
create index if not exists issued_policy_person_issued_idx
  on issued_policy(person_id, issued_at desc);

-- ---------------------------------------------------------------------------
-- deposit: money actually received against an issued policy
-- ---------------------------------------------------------------------------
create table if not exists deposit (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  policy_id uuid not null references issued_policy(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'received' check (status in (
    'received','nsf','refunded'
  )),
  received_at timestamptz not null default now(),
  notes text
);
create index if not exists deposit_person_received_idx
  on deposit(person_id, received_at desc);
create index if not exists deposit_policy_idx
  on deposit(policy_id);

-- ---------------------------------------------------------------------------
-- tracker_entry: per-day activity totals entered on the Tracker page
-- ---------------------------------------------------------------------------
create table if not exists tracker_entry (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  entry_date date not null,
  dials integer not null default 0 check (dials >= 0),
  contacts integer not null default 0 check (contacts >= 0),
  appointments integer not null default 0 check (appointments >= 0),
  presentations integer not null default 0 check (presentations >= 0),
  sales integer not null default 0 check (sales >= 0),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, entry_date)
);
create index if not exists tracker_entry_person_date_idx
  on tracker_entry(person_id, entry_date desc);

drop trigger if exists tracker_entry_updated_at on tracker_entry;
create trigger tracker_entry_updated_at
  before update on tracker_entry
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Read = can_view(person_id) (self + downline + owner). Write = self only.
-- ---------------------------------------------------------------------------
alter table sales_lead      enable row level security;
alter table contact_attempt enable row level security;
alter table appointment     enable row level security;
alter table presentation    enable row level security;
alter table sale            enable row level security;
alter table issued_policy   enable row level security;
alter table deposit         enable row level security;
alter table tracker_entry   enable row level security;

drop policy if exists "sales_lead: read" on sales_lead;
create policy "sales_lead: read" on sales_lead for select using (can_view(person_id));
drop policy if exists "sales_lead: write" on sales_lead;
create policy "sales_lead: write" on sales_lead for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "contact_attempt: read" on contact_attempt;
create policy "contact_attempt: read" on contact_attempt for select using (can_view(person_id));
drop policy if exists "contact_attempt: write" on contact_attempt;
create policy "contact_attempt: write" on contact_attempt for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "appointment: read" on appointment;
create policy "appointment: read" on appointment for select using (can_view(person_id));
drop policy if exists "appointment: write" on appointment;
create policy "appointment: write" on appointment for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "presentation: read" on presentation;
create policy "presentation: read" on presentation for select using (can_view(person_id));
drop policy if exists "presentation: write" on presentation;
create policy "presentation: write" on presentation for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "sale: read" on sale;
create policy "sale: read" on sale for select using (can_view(person_id));
drop policy if exists "sale: write" on sale;
create policy "sale: write" on sale for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "issued_policy: read" on issued_policy;
create policy "issued_policy: read" on issued_policy for select using (can_view(person_id));
drop policy if exists "issued_policy: write" on issued_policy;
create policy "issued_policy: write" on issued_policy for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "deposit: read" on deposit;
create policy "deposit: read" on deposit for select using (can_view(person_id));
drop policy if exists "deposit: write" on deposit;
create policy "deposit: write" on deposit for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "tracker_entry: read" on tracker_entry;
create policy "tracker_entry: read" on tracker_entry for select using (can_view(person_id));
drop policy if exists "tracker_entry: write" on tracker_entry;
create policy "tracker_entry: write" on tracker_entry for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());
