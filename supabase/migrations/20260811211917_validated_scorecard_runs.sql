-- Validated Producer + Builder Scorecard runs. A run freezes the complete
-- period-end population before any member artifact can be published.

alter table scorecard_snapshot
  drop constraint if exists scorecard_snapshot_period_kind_check;
update scorecard_snapshot set period_kind = 'annual' where period_kind = 'yearly';
alter table scorecard_snapshot
  add constraint scorecard_snapshot_period_kind_check
  check (period_kind in ('monthly', 'quarterly', 'annual'));

create table scorecard_metric_run (
  id uuid primary key default gen_random_uuid(),
  period_kind text not null check (period_kind in ('monthly', 'quarterly', 'annual')),
  period_start date not null,
  period_end date not null,
  period_label text not null,
  revision integer not null default 1 check (revision > 0),
  prior_run_id uuid references scorecard_metric_run(id) on delete restrict,
  status text not null default 'capturing'
    check (status in ('capturing', 'validating', 'blocked', 'ready', 'generating', 'published', 'delivery_errors')),
  initiated_by uuid not null references person(id) on delete restrict,
  correction_reason text,
  source_manifest jsonb not null default '{}'::jsonb,
  eligible_producer_count integer not null default 0 check (eligible_producer_count >= 0),
  eligible_builder_count integer not null default 0 check (eligible_builder_count >= 0),
  checked_count integer not null default 0 check (checked_count >= 0),
  passed_count integer not null default 0 check (passed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  held_count integer not null default 0 check (held_count >= 0),
  generated_count integer not null default 0 check (generated_count >= 0),
  published_count integer not null default 0 check (published_count >= 0),
  delivery_error_count integer not null default 0 check (delivery_error_count >= 0),
  ready_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check ((revision = 1 and prior_run_id is null and correction_reason is null)
    or (revision > 1 and prior_run_id is not null and correction_reason is not null))
);

create unique index scorecard_metric_run_revision_idx
  on scorecard_metric_run (period_kind, period_start, revision);
create index scorecard_metric_run_history_idx
  on scorecard_metric_run (period_start desc, revision desc);
create index scorecard_metric_run_prior_idx
  on scorecard_metric_run (prior_run_id) where prior_run_id is not null;

create table person_role_status_fact (
  run_id uuid not null references scorecard_metric_run(id) on delete restrict,
  person_id uuid not null references person(id) on delete restrict,
  full_name text not null,
  email text,
  photo_url text,
  upline_id uuid references person(id) on delete restrict,
  active_at_period_end boolean not null,
  producer_at_period_end boolean not null,
  builder_at_period_end boolean not null,
  primary key (run_id, person_id),
  check (not builder_at_period_end or producer_at_period_end)
);

create table person_role_status_history (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete restrict,
  upline_id uuid references person(id) on delete restrict,
  status text not null check (status in ('active', 'removed')),
  is_producer boolean not null,
  is_builder boolean not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  confidence text not null check (confidence in ('backfilled_current', 'observed')),
  recorded_at timestamptz not null default now(),
  check (not is_builder or is_producer),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index person_role_status_history_current_idx
  on person_role_status_history (person_id) where effective_to is null;
create index person_role_status_history_period_idx
  on person_role_status_history (person_id, effective_from, effective_to);

insert into person_role_status_history (
  person_id, upline_id, status, is_producer, is_builder, effective_from, confidence
)
select id, upline_id, status, is_producer, is_builder, created_at, 'backfilled_current'
from person;

create or replace function capture_person_role_status_history()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  change_at timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    insert into person_role_status_history (
      person_id, upline_id, status, is_producer, is_builder, effective_from, confidence
    ) values (new.id, new.upline_id, new.status, new.is_producer, new.is_builder, change_at, 'observed');
  elsif old.upline_id is distinct from new.upline_id
    or old.status is distinct from new.status
    or old.is_producer is distinct from new.is_producer
    or old.is_builder is distinct from new.is_builder
  then
    update person_role_status_history set effective_to = change_at
      where person_id = new.id and effective_to is null;
    insert into person_role_status_history (
      person_id, upline_id, status, is_producer, is_builder, effective_from, confidence
    ) values (new.id, new.upline_id, new.status, new.is_producer, new.is_builder, change_at, 'observed');
  end if;
  return new;
end;
$$;

create trigger person_role_status_history_capture
  after insert or update of upline_id, status, is_producer, is_builder on person
  for each row execute function capture_person_role_status_history();

create index person_role_status_fact_upline_idx
  on person_role_status_fact (run_id, upline_id);

create table producer_period_metric (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references scorecard_metric_run(id) on delete restrict,
  person_id uuid not null references person(id) on delete restrict,
  visible_payload jsonb not null,
  source_coverage jsonb not null,
  source_fingerprint text not null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, person_id)
);

create index producer_period_metric_person_idx
  on producer_period_metric (person_id, run_id);

create table builder_period_metric (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references scorecard_metric_run(id) on delete restrict,
  person_id uuid not null references person(id) on delete restrict,
  visible_payload jsonb not null,
  team_ip_cents bigint not null check (team_ip_cents >= 0),
  team_rank integer check (team_rank > 0),
  team_rank_population integer check (team_rank_population > 0),
  team_rank_unavailable_reason text
    check (team_rank_unavailable_reason in ('not_represented_in_gateway')),
  active_writers integer not null check (active_writers >= 0),
  active_writer_report_dates date[] not null,
  first_leg_percent numeric(9, 4) check (first_leg_percent between 0 and 100),
  average_monthly_ip_per_writer_cents bigint
    check (average_monthly_ip_per_writer_cents >= 0),
  month_count integer not null check (month_count in (1, 3, 12)),
  prior_team_ip_cents bigint check (prior_team_ip_cents >= 0),
  growth_percent numeric(12, 4),
  growth_comparison text not null check (growth_comparison in ('mom', 'qoq', 'yoy')),
  recruits_added integer not null check (recruits_added >= 0),
  recruiting_rank integer not null check (recruiting_rank > 0),
  recruiting_rank_population integer not null check (recruiting_rank_population > 0),
  trend_buckets jsonb not null,
  source_coverage jsonb not null,
  source_fingerprint text not null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, person_id),
  check (
    (team_rank is not null and team_rank_population is not null and team_rank_unavailable_reason is null)
    or
    (team_rank is null and team_rank_population is null and team_rank_unavailable_reason is not null)
  ),
  check (active_writers > 0 or average_monthly_ip_per_writer_cents is null),
  check (team_ip_cents > 0 or first_leg_percent is null)
);

create index builder_period_metric_person_idx
  on builder_period_metric (person_id, run_id);

create table scorecard_validation_result (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references scorecard_metric_run(id) on delete restrict,
  card_type text check (card_type in ('producer', 'builder')),
  person_id uuid references person(id) on delete restrict,
  check_code text not null,
  field_name text,
  status text not null check (status in ('passed', 'failed', 'held')),
  expected_value jsonb,
  actual_value jsonb,
  source_context jsonb not null default '{}'::jsonb,
  safe_next_action text,
  first_verified_at timestamptz not null default now(),
  latest_verified_at timestamptz not null default now()
);

create index scorecard_validation_result_run_status_idx
  on scorecard_validation_result (run_id, status);
create index scorecard_validation_result_person_idx
  on scorecard_validation_result (person_id) where person_id is not null;

create table scorecard_run_retry (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references scorecard_metric_run(id) on delete restrict,
  attempted_by uuid not null references person(id) on delete restrict,
  reason text not null,
  result_status text not null check (result_status in ('blocked', 'ready', 'failed')),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index scorecard_run_retry_run_idx
  on scorecard_run_retry (run_id, created_at);

alter table scorecard_snapshot
  add column metric_run_id uuid references scorecard_metric_run(id) on delete restrict,
  add column producer_metric_id uuid references producer_period_metric(id) on delete restrict,
  add column builder_metric_id uuid references builder_period_metric(id) on delete restrict;

alter table scorecard_snapshot
  add constraint scorecard_snapshot_metric_source_check check (
    metric_run_id is null
    or (card_type = 'producer' and producer_metric_id is not null and builder_metric_id is null)
    or (card_type = 'builder' and builder_metric_id is not null and producer_metric_id is null)
  );

create index scorecard_snapshot_run_idx
  on scorecard_snapshot (metric_run_id) where metric_run_id is not null;
create unique index scorecard_snapshot_producer_metric_idx
  on scorecard_snapshot (producer_metric_id) where producer_metric_id is not null;
create unique index scorecard_snapshot_builder_metric_idx
  on scorecard_snapshot (builder_metric_id) where builder_metric_id is not null;

create table scorecard_delivery (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references scorecard_snapshot(id) on delete restrict,
  delivery_type text not null check (delivery_type in ('producer_email', 'builder_email')),
  recipient_email text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'missing_recipient')),
  idempotency_key text not null unique,
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  last_attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (snapshot_id, delivery_type)
);

create index scorecard_delivery_status_idx
  on scorecard_delivery (status, created_at);

create or replace function protect_ready_scorecard_metric_data()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  referenced_run_id uuid;
begin
  referenced_run_id := case when tg_op = 'DELETE' then old.run_id else new.run_id end;
  if exists (
    select 1 from scorecard_metric_run
    where id = referenced_run_id
      and status in ('ready', 'generating', 'published', 'delivery_errors')
  ) or (tg_op = 'UPDATE' and exists (
    select 1 from scorecard_metric_run
    where id = old.run_id
      and status in ('ready', 'generating', 'published', 'delivery_errors')
  )) then
    raise exception 'Validated Scorecard run data is immutable; create a correction revision.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function protect_person_role_status_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Person role/status history cannot be deleted.';
  end if;
  if old.person_id is distinct from new.person_id
    or old.upline_id is distinct from new.upline_id
    or old.status is distinct from new.status
    or old.is_producer is distinct from new.is_producer
    or old.is_builder is distinct from new.is_builder
    or old.effective_from is distinct from new.effective_from
    or old.confidence is distinct from new.confidence
    or old.recorded_at is distinct from new.recorded_at
    or old.effective_to is not null
    or new.effective_to is null
  then
    raise exception 'Person role/status history is append-only except for closing the current interval.';
  end if;
  return new;
end;
$$;

create trigger person_role_status_history_immutable
  before update or delete on person_role_status_history
  for each row execute function protect_person_role_status_history();

create trigger producer_period_metric_immutable
  before insert or update or delete on producer_period_metric
  for each row execute function protect_ready_scorecard_metric_data();
create trigger builder_period_metric_immutable
  before insert or update or delete on builder_period_metric
  for each row execute function protect_ready_scorecard_metric_data();
create trigger person_role_status_fact_immutable
  before insert or update or delete on person_role_status_fact
  for each row execute function protect_ready_scorecard_metric_data();

create or replace function guard_scorecard_run_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('ready', 'generating', 'published', 'delivery_errors') and (
    old.period_kind is distinct from new.period_kind
    or old.period_start is distinct from new.period_start
    or old.period_end is distinct from new.period_end
    or old.period_label is distinct from new.period_label
    or old.revision is distinct from new.revision
    or old.prior_run_id is distinct from new.prior_run_id
    or old.initiated_by is distinct from new.initiated_by
    or old.correction_reason is distinct from new.correction_reason
    or old.source_manifest is distinct from new.source_manifest
    or old.eligible_producer_count is distinct from new.eligible_producer_count
    or old.eligible_builder_count is distinct from new.eligible_builder_count
    or old.checked_count is distinct from new.checked_count
    or old.passed_count is distinct from new.passed_count
    or old.failed_count is distinct from new.failed_count
    or old.held_count is distinct from new.held_count
  ) then
    raise exception 'Ready and published Scorecard run inputs are immutable.';
  end if;
  if not (
    old.status = new.status
    or (old.status = 'capturing' and new.status in ('validating', 'blocked'))
    or (old.status = 'validating' and new.status in ('blocked', 'ready'))
    or (old.status = 'blocked' and new.status = 'validating')
    or (old.status = 'ready' and new.status in ('generating', 'published', 'delivery_errors'))
    or (old.status = 'generating' and new.status in ('published', 'delivery_errors'))
    or (old.status = 'published' and new.status = 'delivery_errors')
    or (old.status = 'delivery_errors' and new.status = 'published')
  ) then
    raise exception 'Invalid Scorecard run status transition from % to %.', old.status, new.status;
  end if;
  return new;
end;
$$;

create trigger scorecard_metric_run_transition_guard
  before update on scorecard_metric_run
  for each row execute function guard_scorecard_run_transition();

create or replace function enforce_validated_scorecard_generation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  run_status text;
  source_run_id uuid;
  source_person_id uuid;
  source_visible_payload jsonb;
begin
  if new.metric_run_id is null then
    if new.lifecycle_status in ('final', 'corrected') then
      raise exception 'Finalized Scorecards require validated run provenance.';
    end if;
    return new;
  end if;

  select status into run_status from scorecard_metric_run where id = new.metric_run_id;
  if run_status not in ('ready', 'generating', 'published', 'delivery_errors') then
    raise exception 'Scorecard artifacts can only be generated from a fully validated run.';
  end if;

  if new.card_type = 'producer' then
    select run_id, person_id, visible_payload into source_run_id, source_person_id, source_visible_payload
      from producer_period_metric where id = new.producer_metric_id and validated_at is not null;
  else
    select run_id, person_id, visible_payload into source_run_id, source_person_id, source_visible_payload
      from builder_period_metric where id = new.builder_metric_id and validated_at is not null;
  end if;

  if source_run_id is distinct from new.metric_run_id or source_person_id is distinct from new.person_id then
    raise exception 'Scorecard artifact does not match its validated metric row.';
  end if;
  if source_visible_payload is distinct from new.kpi_results then
    raise exception 'Scorecard artifact payload does not match its validated metric row.';
  end if;
  if new.lifecycle_status = 'corrected' and not exists (
    select 1 from scorecard_snapshot prior
    where prior.id = new.prior_revision_id
      and prior.person_id = new.person_id
      and prior.card_type = new.card_type
      and prior.period_kind = new.period_kind
      and prior.period_start = new.period_start
      and prior.period_end = new.period_end
      and prior.kpi_results is distinct from new.kpi_results
  ) then
    raise exception 'Corrected Scorecard requires matching lineage and a changed visible payload.';
  end if;
  return new;
end;
$$;

create trigger scorecard_snapshot_validated_run
  before insert on scorecard_snapshot
  for each row execute function enforce_validated_scorecard_generation();
create trigger scorecard_snapshot_validated_update
  before update of person_id, card_type, period_kind, period_start, period_end,
    lifecycle_status, prior_revision_id, kpi_results, metric_run_id,
    producer_metric_id, builder_metric_id on scorecard_snapshot
  for each row execute function enforce_validated_scorecard_generation();

-- The foundation schedule constraint was written for monthly Producer cards.
-- Builder, quarterly, and annual cards do not require daily tracker facts.
create or replace function enforce_final_scorecard_schedule_facts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.card_type = 'producer'
    and new.period_kind = 'monthly'
    and new.lifecycle_status in ('final', 'corrected')
    and exists (
      select 1
      from generate_series(new.period_start, new.period_end, interval '1 day') expected(day)
      where not exists (
        select 1 from scorecard_schedule_fact fact
        where fact.scorecard_snapshot_id = new.id and fact.fact_date = expected.day::date
      )
    )
  then
    raise exception 'Finalized monthly Producer Scorecard requires one schedule fact for every period date.';
  end if;
  return new;
end;
$$;

-- Publishes one initial run atomically. Each JSON row is already formatting-ready
-- and points at its independently validated metric row; this function performs
-- no business math.
create or replace function publish_scorecard_run(
  p_run_id uuid,
  p_snapshots jsonb
)
returns table(snapshot_id uuid, delivery_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  run_record scorecard_metric_run%rowtype;
  artifact jsonb;
  created_snapshot_id uuid;
  created_delivery_id uuid;
  metric_count integer;
  expected_count integer;
  recipient_email text;
  delivery_kind text;
begin
  select * into run_record from scorecard_metric_run where id = p_run_id for update;
  if not found then raise exception 'Scorecard run not found.'; end if;
  if run_record.status not in ('ready', 'generating', 'published', 'delivery_errors') or run_record.failed_count <> 0 then
    raise exception 'Only a fully validated Scorecard run can be published.';
  end if;

  expected_count := run_record.eligible_producer_count + run_record.eligible_builder_count;
  if run_record.passed_count <> expected_count or run_record.checked_count <> expected_count then
    raise exception 'Validated row counts do not match the frozen eligible population.';
  end if;
  select count(*) into metric_count from jsonb_array_elements(p_snapshots);
  if metric_count <> (
    select count(distinct value->>'metricId') from jsonb_array_elements(p_snapshots)
  ) then
    raise exception 'Scorecard publication contains duplicate metric artifacts.';
  end if;
  if (select count(*) from producer_period_metric where run_id = p_run_id and validated_at is not null)
      <> run_record.eligible_producer_count
    or (select count(*) from builder_period_metric where run_id = p_run_id and validated_at is not null)
      <> run_record.eligible_builder_count
  then
    raise exception 'Validated metric rows do not match the frozen eligible population.';
  end if;
  if run_record.revision = 1 and metric_count <> expected_count then
    raise exception 'Initial publication requires every eligible Producer and Builder artifact.';
  end if;
  if run_record.revision > 1 then
    if metric_count <> (
      select count(*) from (
        select current_metric.id
        from producer_period_metric current_metric
        join producer_period_metric prior_metric
          on prior_metric.run_id = run_record.prior_run_id
          and prior_metric.person_id = current_metric.person_id
        where current_metric.run_id = p_run_id
          and current_metric.visible_payload is distinct from prior_metric.visible_payload
        union all
        select current_metric.id
        from builder_period_metric current_metric
        join builder_period_metric prior_metric
          on prior_metric.run_id = run_record.prior_run_id
          and prior_metric.person_id = current_metric.person_id
        where current_metric.run_id = p_run_id
          and current_metric.visible_payload is distinct from prior_metric.visible_payload
      ) affected
    ) or exists (
      select 1 from (
        select current_metric.id
        from producer_period_metric current_metric
        join producer_period_metric prior_metric
          on prior_metric.run_id = run_record.prior_run_id
          and prior_metric.person_id = current_metric.person_id
        where current_metric.run_id = p_run_id
          and current_metric.visible_payload is distinct from prior_metric.visible_payload
        union all
        select current_metric.id
        from builder_period_metric current_metric
        join builder_period_metric prior_metric
          on prior_metric.run_id = run_record.prior_run_id
          and prior_metric.person_id = current_metric.person_id
        where current_metric.run_id = p_run_id
          and current_metric.visible_payload is distinct from prior_metric.visible_payload
      ) affected
      where not exists (
        select 1 from jsonb_array_elements(p_snapshots) supplied
        where supplied.value->>'metricId' = affected.id::text
      )
    ) then
      raise exception 'Correction publication must include the complete changed-card affected set.';
    end if;
  end if;

  for artifact in select value from jsonb_array_elements(p_snapshots)
  loop
    insert into scorecard_snapshot (
      person_id, card_type, period_kind, period_start, period_end,
      lifecycle_status, revision, prior_revision_id, correction_reason,
      corrected_by, source_coverage, kpi_results, rank_context, finalized_at,
      metric_run_id, producer_metric_id, builder_metric_id
    ) values (
      (artifact->>'personId')::uuid,
      artifact->>'cardType',
      run_record.period_kind,
      run_record.period_start,
      run_record.period_end,
      case when run_record.revision = 1 then 'final' else 'corrected' end,
      run_record.revision,
      nullif(artifact->>'priorSnapshotId', '')::uuid,
      run_record.correction_reason,
      case when run_record.revision = 1 then null else run_record.initiated_by end,
      coalesce(artifact->'sourceCoverage', '{}'::jsonb),
      artifact->'visiblePayload',
      artifact->'rankContext',
      now(),
      p_run_id,
      case when artifact->>'cardType' = 'producer' then (artifact->>'metricId')::uuid else null end,
      case when artifact->>'cardType' = 'builder' then (artifact->>'metricId')::uuid else null end
    )
    on conflict do nothing
    returning id into created_snapshot_id;

    if created_snapshot_id is null then
      select id into created_snapshot_id from scorecard_snapshot
      where (producer_metric_id = nullif(artifact->>'metricId', '')::uuid)
         or (builder_metric_id = nullif(artifact->>'metricId', '')::uuid);
    end if;

    if artifact->>'cardType' = 'producer' and run_record.period_kind = 'monthly' then
      insert into scorecard_schedule_fact (
        scorecard_snapshot_id, fact_date, expected_working_day, tracker_submitted
      )
      select created_snapshot_id, (fact->>'factDate')::date,
        (fact->>'expectedWorkingDay')::boolean,
        (fact->>'trackerSubmitted')::boolean
      from jsonb_array_elements(coalesce(artifact->'scheduleFacts', '[]'::jsonb)) fact
      on conflict do nothing;
    end if;

    select email into recipient_email from person_role_status_fact
      where run_id = p_run_id and person_id = (artifact->>'personId')::uuid;
    delivery_kind := case when artifact->>'cardType' = 'producer' then 'producer_email' else 'builder_email' end;
    insert into scorecard_delivery (
      snapshot_id, delivery_type, recipient_email, status, idempotency_key
    ) values (
      created_snapshot_id, delivery_kind, recipient_email,
      case when recipient_email is null or btrim(recipient_email) = '' then 'missing_recipient' else 'pending' end,
      created_snapshot_id::text || ':' || delivery_kind
    )
    on conflict (snapshot_id, delivery_type) do update
      set snapshot_id = excluded.snapshot_id
    returning id into created_delivery_id;

    snapshot_id := created_snapshot_id;
    delivery_id := created_delivery_id;
    return next;
    created_snapshot_id := null;
    created_delivery_id := null;
  end loop;

  if run_record.revision = 1 and (
    select count(*) from scorecard_snapshot where metric_run_id = p_run_id
  ) <> expected_count then
    raise exception 'Initial publication did not persist the complete artifact population.';
  end if;

  update scorecard_metric_run
    set status = case when exists (
          select 1 from scorecard_delivery delivery
          join scorecard_snapshot snapshot on snapshot.id = delivery.snapshot_id
          where snapshot.metric_run_id = p_run_id and delivery.status = 'missing_recipient'
        ) then 'delivery_errors' else 'published' end,
        generated_count = (select count(*) from scorecard_snapshot where metric_run_id = p_run_id),
        published_count = (select count(*) from scorecard_snapshot where metric_run_id = p_run_id),
        delivery_error_count = (select count(*) from scorecard_delivery delivery
          join scorecard_snapshot snapshot on snapshot.id = delivery.snapshot_id
          where snapshot.metric_run_id = p_run_id and delivery.status in ('failed', 'missing_recipient')),
        published_at = coalesce(published_at, now()),
        updated_at = now()
    where id = p_run_id;
end;
$$;

create or replace function protect_scorecard_run_audit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Scorecard audit history is append-only.';
end;
$$;

create trigger scorecard_validation_result_append_only
  before update or delete on scorecard_validation_result
  for each row execute function protect_scorecard_run_audit();
create trigger scorecard_run_retry_append_only
  before update or delete on scorecard_run_retry
  for each row execute function protect_scorecard_run_audit();

alter table scorecard_metric_run enable row level security;
alter table person_role_status_fact enable row level security;
alter table person_role_status_history enable row level security;
alter table producer_period_metric enable row level security;
alter table builder_period_metric enable row level security;
alter table scorecard_validation_result enable row level security;
alter table scorecard_run_retry enable row level security;
alter table scorecard_delivery enable row level security;

create policy producer_period_metric_read_own on producer_period_metric
  for select using (person_id = current_person_id());
create policy builder_period_metric_read_own on builder_period_metric
  for select using (person_id = current_person_id());
create policy scorecard_delivery_read_own on scorecard_delivery
  for select using (
    exists (
      select 1 from scorecard_snapshot snapshot
      where snapshot.id = snapshot_id and snapshot.person_id = current_person_id()
    )
  );

-- Current Supabase projects may not expose new public-schema tables by default.
-- Grant only the reads needed by member RLS; all workflow writes stay service-role.
grant select on producer_period_metric, builder_period_metric, scorecard_delivery to authenticated;
grant all on scorecard_metric_run, person_role_status_fact, producer_period_metric,
  person_role_status_history, builder_period_metric, scorecard_validation_result, scorecard_run_retry,
  scorecard_delivery to service_role;

revoke all on function protect_ready_scorecard_metric_data() from public, anon, authenticated;
revoke all on function enforce_validated_scorecard_generation() from public, anon, authenticated;
revoke all on function protect_scorecard_run_audit() from public, anon, authenticated;
revoke all on function publish_scorecard_run(uuid, jsonb) from public, anon, authenticated;
revoke all on function capture_person_role_status_history() from public, anon, authenticated;
revoke all on function guard_scorecard_run_transition() from public, anon, authenticated;
revoke all on function protect_person_role_status_history() from public, anon, authenticated;
grant execute on function protect_ready_scorecard_metric_data() to service_role;
grant execute on function enforce_validated_scorecard_generation() to service_role;
grant execute on function protect_scorecard_run_audit() to service_role;
grant execute on function publish_scorecard_run(uuid, jsonb) to service_role;
grant execute on function capture_person_role_status_history() to service_role;
grant execute on function guard_scorecard_run_transition() to service_role;
grant execute on function protect_person_role_status_history() to service_role;

-- The per-recipient foundation finalizer is superseded by the all-or-nothing
-- run publisher above. Existing snapshots remain readable; new bypasses do not.
revoke execute on function finalize_monthly_producer_scorecard(uuid, date, date, integer, jsonb, jsonb, jsonb, jsonb, uuid, text, uuid) from service_role;
