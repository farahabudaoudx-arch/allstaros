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

create table if not exists member_work_schedule (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  working_weekdays smallint[] not null default array[1,2,3,4,5],
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (working_weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);

create table if not exists member_work_schedule_exception (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references member_work_schedule(id) on delete cascade,
  exception_date date not null,
  is_working_day boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists scorecard_schedule_fact (
  scorecard_snapshot_id uuid not null references scorecard_snapshot(id) on delete restrict,
  fact_date date not null,
  expected_working_day boolean not null,
  tracker_submitted boolean not null,
  primary key (scorecard_snapshot_id, fact_date)
);

-- The lifecycle job uses this single database operation so a final snapshot
-- can never exist without one frozen schedule fact for every date in-period.
create or replace function finalize_monthly_producer_scorecard(
  p_person_id uuid,
  p_period_start date,
  p_period_end date,
  p_revision integer,
  p_source_coverage jsonb,
  p_kpi_results jsonb,
  p_rank_context jsonb,
  p_schedule_facts jsonb,
  p_prior_revision_id uuid default null,
  p_correction_reason text default null,
  p_corrected_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_id uuid;
  expected_fact_count integer := (p_period_end - p_period_start) + 1;
  supplied_fact_count integer;
  snapshot_status text := case when p_prior_revision_id is null then 'final' else 'corrected' end;
begin
  select count(*)
    into supplied_fact_count
    from jsonb_array_elements(p_schedule_facts) fact;

  if supplied_fact_count <> expected_fact_count or exists (
    select 1 from jsonb_array_elements(p_schedule_facts) fact
    where (fact->>'factDate')::date not between p_period_start and p_period_end
  ) then
    raise exception 'Finalized Scorecard requires one schedule fact for every period date.';
  end if;

  insert into scorecard_snapshot (
    person_id, card_type, period_kind, period_start, period_end, lifecycle_status,
    revision, prior_revision_id, correction_reason, corrected_by, source_coverage,
    kpi_results, rank_context, finalized_at
  ) values (
    p_person_id, 'producer', 'monthly', p_period_start, p_period_end, snapshot_status,
    p_revision, p_prior_revision_id, p_correction_reason, p_corrected_by,
    p_source_coverage, p_kpi_results, p_rank_context, now()
  ) returning id into snapshot_id;

  insert into scorecard_schedule_fact (
    scorecard_snapshot_id, fact_date, expected_working_day, tracker_submitted
  )
  select snapshot_id, (fact->>'factDate')::date,
    (fact->>'expectedWorkingDay')::boolean,
    (fact->>'trackerSubmitted')::boolean
  from jsonb_array_elements(p_schedule_facts) fact;

  return snapshot_id;
end;
$$;

revoke all on function finalize_monthly_producer_scorecard(uuid, date, date, integer, jsonb, jsonb, jsonb, jsonb, uuid, text, uuid) from public;
grant execute on function finalize_monthly_producer_scorecard(uuid, date, date, integer, jsonb, jsonb, jsonb, jsonb, uuid, text, uuid) to service_role;

create or replace function enforce_final_scorecard_schedule_facts()
returns trigger
language plpgsql
as $$
begin
  if new.lifecycle_status in ('final', 'corrected') and exists (
    select 1
    from generate_series(new.period_start, new.period_end, interval '1 day') expected(day)
    where not exists (
      select 1 from scorecard_schedule_fact fact
      where fact.scorecard_snapshot_id = new.id and fact.fact_date = expected.day::date
    )
  ) then
    raise exception 'Finalized Scorecard requires one schedule fact for every period date.';
  end if;
  return new;
end;
$$;

create constraint trigger scorecard_snapshot_complete_schedule_facts
  after insert or update of lifecycle_status on scorecard_snapshot
  deferrable initially deferred
  for each row execute function enforce_final_scorecard_schedule_facts();

create or replace function enforce_scorecard_fact_period()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from scorecard_snapshot snapshot
    where snapshot.id = new.scorecard_snapshot_id
      and new.fact_date between snapshot.period_start and snapshot.period_end
  ) then
    raise exception 'Scorecard schedule fact date must fall inside its snapshot period.';
  end if;
  return new;
end;
$$;

create trigger scorecard_schedule_fact_period
  before insert on scorecard_schedule_fact
  for each row execute function enforce_scorecard_fact_period();

create or replace function protect_scorecard_schedule_history()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Scorecard schedule history is append-only.';
end;
$$;

create trigger member_work_schedule_append_only
  before update or delete on member_work_schedule
  for each row execute function protect_scorecard_schedule_history();
create trigger member_work_schedule_exception_append_only
  before update or delete on member_work_schedule_exception
  for each row execute function protect_scorecard_schedule_history();
create trigger scorecard_schedule_fact_immutable
  before update or delete on scorecard_schedule_fact
  for each row execute function protect_scorecard_schedule_history();

alter table member_work_schedule enable row level security;
alter table member_work_schedule_exception enable row level security;
alter table scorecard_schedule_fact enable row level security;

create policy member_work_schedule_read_own on member_work_schedule
  for select using (person_id = current_person_id());
create policy member_work_schedule_insert_own on member_work_schedule
  for insert with check (person_id = current_person_id());
create policy member_work_schedule_exception_read_own on member_work_schedule_exception
  for select using (
    exists (
      select 1 from member_work_schedule schedule
      where schedule.id = schedule_id and schedule.person_id = current_person_id()
    )
  );
create policy member_work_schedule_exception_insert_own on member_work_schedule_exception
  for insert with check (
    exists (
      select 1 from member_work_schedule schedule
      where schedule.id = schedule_id and schedule.person_id = current_person_id()
    )
  );
create policy scorecard_schedule_fact_read_own on scorecard_schedule_fact
  for select using (
    exists (
      select 1 from scorecard_snapshot snapshot
      where snapshot.id = scorecard_snapshot_id and snapshot.person_id = current_person_id()
    )
  );

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
