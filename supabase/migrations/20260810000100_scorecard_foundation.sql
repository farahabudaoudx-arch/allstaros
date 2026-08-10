-- Scorecards foundation. This migration deliberately owns the Gateway tables
-- already used by the application so clean environments do not depend on a
-- production-only schema. Existing installations are preserved by IF NOT EXISTS.

create table if not exists gateway_issued_premium_import (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('wtd', 'mtd', 'ytd')),
  status text not null check (status in ('pending', 'imported', 'no_new_report', 'failed', 'skipped')),
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
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index if not exists gateway_ip_import_checksum_idx
  on gateway_issued_premium_import (period_type, source_checksum)
  where source_checksum is not null;

create table if not exists producer_issued_premium (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  import_id uuid references gateway_issued_premium_import(id) on delete set null,
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
  personal_ip_cents bigint not null default 0 check (personal_ip_cents >= 0),
  team_ip_cents bigint not null default 0 check (team_ip_cents >= 0),
  first_leg_producer text,
  first_leg_npn text,
  first_leg_percent numeric(7, 4),
  outside_first_leg_cents bigint not null default 0 check (outside_first_leg_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, period_type, report_date)
);

create index if not exists producer_ip_period_date_idx
  on producer_issued_premium (period_type, report_date desc);
create index if not exists producer_ip_person_date_idx
  on producer_issued_premium (person_id, report_date desc);

create table if not exists scorecard_snapshot (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete restrict,
  card_type text not null check (card_type in ('producer', 'builder')),
  period_kind text not null check (period_kind in ('monthly', 'quarterly', 'yearly')),
  period_start date not null,
  period_end date not null,
  lifecycle_status text not null check (lifecycle_status in ('in_progress', 'waiting_for_data', 'final', 'corrected')),
  revision integer not null default 1 check (revision > 0),
  prior_revision_id uuid references scorecard_snapshot(id) on delete restrict,
  correction_reason text,
  corrected_by uuid references person(id) on delete restrict,
  source_coverage jsonb not null default '{}'::jsonb,
  kpi_results jsonb not null default '{}'::jsonb,
  rank_context jsonb,
  coaching_output jsonb,
  training_library_version text,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  check ((lifecycle_status = 'corrected') = (prior_revision_id is not null))
);

create unique index if not exists scorecard_snapshot_revision_idx
  on scorecard_snapshot (person_id, card_type, period_kind, period_start, revision);
create index if not exists scorecard_snapshot_history_idx
  on scorecard_snapshot (person_id, card_type, period_start desc);

create or replace function protect_final_scorecard_snapshot()
returns trigger
language plpgsql
as $$
begin
  if old.lifecycle_status in ('final', 'corrected') then
    raise exception 'Finalized Scorecard snapshots are immutable; create a corrected revision instead.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists scorecard_snapshot_immutable on scorecard_snapshot;
create trigger scorecard_snapshot_immutable
  before update or delete on scorecard_snapshot
  for each row execute function protect_final_scorecard_snapshot();

alter table gateway_issued_premium_import enable row level security;
alter table producer_issued_premium enable row level security;
alter table scorecard_snapshot enable row level security;

-- Members can read only their own rows. Service-role import and lifecycle jobs
-- bypass RLS; no member-facing insert/update/delete policies are introduced.
drop policy if exists producer_ip_read_own on producer_issued_premium;
create policy producer_ip_read_own on producer_issued_premium
  for select using (person_id = current_person_id());

drop policy if exists scorecard_snapshot_read_own on scorecard_snapshot;
create policy scorecard_snapshot_read_own on scorecard_snapshot
  for select using (person_id = current_person_id());
