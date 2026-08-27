-- Gateway issued-premium tables (catch-up).
--
-- These tables were first created on production outside the migration chain
-- (importer + Issued Premium / Hall of Fame / builder home IP lines all depend
-- on them). Fresh / preview databases never got them, which surfaces as:
--   Could not find the table 'public.producer_issued_premium' in the schema cache
--
-- Idempotent: safe to run against a DB that already has the objects.

-- ---------------------------------------------------------------------------
-- Import audit log (one row per CSV / cron attempt)
-- ---------------------------------------------------------------------------
create table if not exists public.gateway_issued_premium_import (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('wtd', 'mtd', 'ytd')),
  status text not null check (status in (
    'pending', 'imported', 'no_new_report', 'failed', 'skipped'
  )),
  report_date date,
  period_start date,
  gateway_label text,
  source_file_name text,
  source_checksum text,
  rows_seen integer not null default 0,
  matched_count integer not null default 0,
  unmatched_count integer not null default 0,
  ambiguous_count integer not null default 0,
  skipped_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists gateway_issued_premium_import_period_created_idx
  on public.gateway_issued_premium_import (period_type, created_at desc);

alter table public.gateway_issued_premium_import enable row level security;

-- Importer runs with the service role. Authenticated users do not need direct
-- access to the audit log; leave policies empty (service role bypasses RLS).

-- ---------------------------------------------------------------------------
-- Per-producer Gateway snapshots (one row per person × period × report date)
-- ---------------------------------------------------------------------------
create table if not exists public.producer_issued_premium (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person(id) on delete cascade,
  import_id uuid references public.gateway_issued_premium_import(id) on delete set null,
  period_type text not null check (period_type in ('wtd', 'mtd', 'ytd')),
  report_date date not null,
  period_start date,
  gateway_label text,
  gateway_producer text,
  gateway_npn text,
  gateway_email text,
  gateway_upline text,
  gateway_upline_npn text,
  gateway_agency text,
  personal_ip_cents bigint not null default 0,
  team_ip_cents bigint not null default 0,
  first_leg_producer text,
  first_leg_npn text,
  first_leg_percent numeric,
  outside_first_leg_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, period_type, report_date)
);

create index if not exists producer_issued_premium_person_period_report_idx
  on public.producer_issued_premium (person_id, period_type, report_date desc);

create index if not exists producer_issued_premium_period_report_idx
  on public.producer_issued_premium (period_type, report_date desc);

drop trigger if exists producer_issued_premium_updated_at on public.producer_issued_premium;
create trigger producer_issued_premium_updated_at
  before update on public.producer_issued_premium
  for each row execute function set_updated_at();

alter table public.producer_issued_premium enable row level security;

drop policy if exists "producer_issued_premium: read" on public.producer_issued_premium;
create policy "producer_issued_premium: read" on public.producer_issued_premium
  for select using (can_view(person_id));

-- Writes come from the Gateway importer (service role). No authenticated write
-- policy — producers never edit Gateway figures by hand.

grant select on public.producer_issued_premium to authenticated;
grant all on public.producer_issued_premium to service_role;
grant all on public.gateway_issued_premium_import to service_role;

-- Force PostgREST to pick up the new tables immediately.
notify pgrst, 'reload schema';
