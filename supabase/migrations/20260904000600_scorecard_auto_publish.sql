-- Ticket #008: automatically publish a complete Scorecard population once
-- exact per-person Gateway WTD evidence has been validated by the application.
-- The database remains the atomic boundary for frozen role facts, validated
-- metric rows, immutable snapshots, and delivery intents.

alter table scorecard_metric_run
  alter column initiated_by drop not null;

alter table scorecard_metric_run
  drop constraint if exists scorecard_metric_run_automated_initiator_check;
alter table scorecard_metric_run
  add constraint scorecard_metric_run_automated_initiator_check check (
    initiated_by is not null
    or (
      generation_scope = 'population'
      and revision = 1
      and prior_run_id is null
      and correction_reason is null
      and source_manifest->>'trigger' = 'gateway_complete'
    )
  );

-- Canonical whole-population historical context. The cutoff is the final
-- microsecond of the period in the client's America/Chicago timezone.
create or replace function scorecard_population_context(
  p_period_end date
)
returns table (
  person_id uuid,
  full_name text,
  email text,
  photo_url text,
  photo_review_status text,
  npn text,
  npn_status text,
  npn_verified_at timestamptz,
  recruit_id uuid,
  recruit_created_at timestamptz,
  recruit_removed_at timestamptz,
  upline_id uuid,
  active_at_period_end boolean,
  producer_at_period_end boolean,
  builder_at_period_end boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select ((p_period_end + 1)::timestamp at time zone 'America/Chicago') - interval '1 microsecond' as cutoff
  ),
  period_facts as (
    select distinct on (history.person_id)
      history.person_id,
      history.upline_id,
      history.status,
      history.is_producer,
      history.is_builder
    from person_role_status_history history
    cross join params
    where history.effective_from <= params.cutoff
      and (history.effective_to is null or history.effective_to > params.cutoff)
    order by history.person_id, history.effective_from desc, history.recorded_at desc
  )
  select
    fact.person_id,
    person.full_name,
    person.email,
    case when person.photo_review_status = 'approved' then person.photo_url else null end as photo_url,
    person.photo_review_status,
    person.npn,
    person.npn_status,
    person.npn_verified_at,
    recruit.id as recruit_id,
    recruit.created_at as recruit_created_at,
    recruit.removed_at as recruit_removed_at,
    fact.upline_id,
    fact.status = 'active' as active_at_period_end,
    fact.is_producer as producer_at_period_end,
    fact.is_builder as builder_at_period_end
  from period_facts fact
  join person on person.id = fact.person_id
  left join recruit on recruit.person_id = fact.person_id
  order by person.full_name, fact.person_id;
$$;

revoke all on function scorecard_population_context(date) from public, anon, authenticated;
grant execute on function scorecard_population_context(date) to service_role;

create or replace function publish_gateway_complete_scorecard_population(
  p_run_id uuid,
  p_period_kind text,
  p_period_start date,
  p_period_end date,
  p_period_label text,
  p_producer_metrics jsonb,
  p_builder_metrics jsonb,
  p_snapshots jsonb,
  p_source_manifest jsonb
)
returns table (
  run_id uuid,
  snapshot_count integer,
  existing boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_run scorecard_metric_run%rowtype;
  producer_count integer;
  builder_count integer;
  expected_count integer;
  supplied_producer_count integer;
  supplied_builder_count integer;
  supplied_snapshot_count integer;
  published_snapshot_count integer;
  metric jsonb;
begin
  if p_run_id is null then
    raise exception 'Automated Scorecard publication requires a run id.';
  end if;
  if p_period_kind not in ('monthly', 'quarterly', 'annual') then
    raise exception 'Automated Scorecard publication requires a canonical period kind.';
  end if;
  if p_period_end < p_period_start then
    raise exception 'Automated Scorecard publication requires an ordered period.';
  end if;
  if extract(day from p_period_start) <> 1 then
    raise exception 'Automated Scorecard publication requires a calendar-boundary start.';
  end if;
  if p_period_kind = 'monthly'
    and p_period_end <> (p_period_start + interval '1 month - 1 day')::date
  then
    raise exception 'Automated monthly Scorecard dates are not canonical.';
  end if;
  if p_period_kind = 'quarterly'
    and (
      extract(month from p_period_start)::integer not in (1, 4, 7, 10)
      or p_period_end <> (p_period_start + interval '3 months - 1 day')::date
    )
  then
    raise exception 'Automated quarterly Scorecard dates are not canonical.';
  end if;
  if p_period_kind = 'annual'
    and (
      extract(month from p_period_start)::integer <> 1
      or p_period_end <> (p_period_start + interval '1 year - 1 day')::date
    )
  then
    raise exception 'Automated annual Scorecard dates are not canonical.';
  end if;
  if p_period_end >= (now() at time zone 'America/Chicago')::date then
    raise exception 'Automated Scorecards can only publish after the period is closed.';
  end if;
  if p_source_manifest->>'trigger' is distinct from 'gateway_complete'
    or p_source_manifest->>'generationScope' is distinct from 'population'
  then
    raise exception 'Automated Scorecard publication requires gateway_complete population provenance.';
  end if;
  if jsonb_typeof(p_producer_metrics) is distinct from 'array'
    or jsonb_typeof(p_builder_metrics) is distinct from 'array'
    or jsonb_typeof(p_snapshots) is distinct from 'array'
  then
    raise exception 'Automated Scorecard publication payloads must be JSON arrays.';
  end if;

  -- Serialize revision-one automatic publication for this exact period.
  perform pg_advisory_xact_lock(
    hashtextextended('scorecard-auto:' || p_period_kind || ':' || p_period_start::text, 0)
  );

  select *
    into existing_run
    from scorecard_metric_run
    where generation_scope = 'population'
      and period_kind = p_period_kind
      and period_start = p_period_start
      and revision = 1
    for update;

  if found then
    if existing_run.status not in ('published', 'delivery_errors') then
      raise exception 'An unfinished population Scorecard run already exists for this period.';
    end if;
    run_id := existing_run.id;
    snapshot_count := (
      select count(*)::integer
      from scorecard_snapshot
      where metric_run_id = existing_run.id
    );
    existing := true;
    return next;
    return;
  end if;

  -- A prior one-person/manual publication owns the immutable revision-one
  -- identity. Never merge those cards into a new population run or partially
  -- replace them; an admin must resolve that exceptional period explicitly.
  if exists (
    select 1
    from scorecard_snapshot snapshot
    where snapshot.period_kind = p_period_kind
      and snapshot.period_start = p_period_start
      and snapshot.period_end = p_period_end
      and snapshot.revision = 1
      and snapshot.lifecycle_status in ('final', 'corrected')
  ) then
    raise exception 'Revision-one Scorecard artifacts already exist outside a population run for this period.';
  end if;

  select
    count(*) filter (where active_at_period_end and producer_at_period_end)::integer,
    count(*) filter (where active_at_period_end and builder_at_period_end)::integer
  into producer_count, builder_count
  from scorecard_population_context(p_period_end);

  producer_count := coalesce(producer_count, 0);
  builder_count := coalesce(builder_count, 0);
  expected_count := producer_count + builder_count;
  if expected_count = 0 then
    raise exception 'Automated Scorecard publication has no eligible period-end population.';
  end if;

  supplied_producer_count := jsonb_array_length(p_producer_metrics);
  supplied_builder_count := jsonb_array_length(p_builder_metrics);
  supplied_snapshot_count := jsonb_array_length(p_snapshots);
  if supplied_producer_count <> producer_count
    or supplied_builder_count <> builder_count
    or supplied_snapshot_count <> expected_count
  then
    raise exception 'Automated Scorecard payload counts do not match the frozen eligible population.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_producer_metrics) supplied
    left join scorecard_population_context(p_period_end) context
      on context.person_id = nullif(supplied.value->>'personId', '')::uuid
    where context.person_id is null
      or not context.active_at_period_end
      or not context.producer_at_period_end
      or coalesce(supplied.value->>'metricId', '') = ''
      or jsonb_typeof(supplied.value->'visiblePayload') is distinct from 'object'
  ) then
    raise exception 'Automated Producer metric set does not match the frozen eligible population.';
  end if;
  if (
    select count(distinct supplied.value->>'personId')
    from jsonb_array_elements(p_producer_metrics) supplied
  ) <> producer_count then
    raise exception 'Automated Producer metric set contains duplicate people.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_builder_metrics) supplied
    left join scorecard_population_context(p_period_end) context
      on context.person_id = nullif(supplied.value->>'personId', '')::uuid
    where context.person_id is null
      or not context.active_at_period_end
      or not context.builder_at_period_end
      or coalesce(supplied.value->>'metricId', '') = ''
      or jsonb_typeof(supplied.value->'visiblePayload') is distinct from 'object'
  ) then
    raise exception 'Automated Builder metric set does not match the frozen eligible population.';
  end if;
  if (
    select count(distinct supplied.value->>'personId')
    from jsonb_array_elements(p_builder_metrics) supplied
  ) <> builder_count then
    raise exception 'Automated Builder metric set contains duplicate people.';
  end if;

  insert into scorecard_metric_run (
    id,
    period_kind,
    period_start,
    period_end,
    period_label,
    revision,
    status,
    initiated_by,
    generation_scope,
    target_person_id,
    target_card_type,
    source_manifest
  ) values (
    p_run_id,
    p_period_kind,
    p_period_start,
    p_period_end,
    p_period_label,
    1,
    'capturing',
    null,
    'population',
    null,
    null,
    p_source_manifest
  );

  insert into person_role_status_fact (
    run_id,
    person_id,
    full_name,
    email,
    photo_url,
    upline_id,
    active_at_period_end,
    producer_at_period_end,
    builder_at_period_end
  )
  select
    p_run_id,
    context.person_id,
    context.full_name,
    context.email,
    context.photo_url,
    context.upline_id,
    context.active_at_period_end,
    context.producer_at_period_end,
    context.builder_at_period_end
  from scorecard_population_context(p_period_end) context;

  insert into producer_period_metric (
    id,
    run_id,
    person_id,
    visible_payload,
    source_coverage,
    source_fingerprint,
    validated_at
  )
  select
    (supplied.value->>'metricId')::uuid,
    p_run_id,
    (supplied.value->>'personId')::uuid,
    supplied.value->'visiblePayload',
    coalesce(supplied.value->'sourceCoverage', '{}'::jsonb),
    md5(
      coalesce(supplied.value->'visiblePayload', '{}'::jsonb)::text
      || '|'
      || coalesce(supplied.value->'sourceCoverage', '{}'::jsonb)::text
    ),
    now()
  from jsonb_array_elements(p_producer_metrics) supplied;

  for metric in select value from jsonb_array_elements(p_builder_metrics)
  loop
    insert into builder_period_metric (
      id,
      run_id,
      person_id,
      visible_payload,
      team_ip_cents,
      team_rank,
      team_rank_population,
      team_rank_unavailable_reason,
      active_writers,
      active_writer_report_dates,
      first_leg_percent,
      average_monthly_ip_per_writer_cents,
      month_count,
      prior_team_ip_cents,
      growth_percent,
      growth_comparison,
      recruits_added,
      recruiting_rank,
      recruiting_rank_population,
      trend_buckets,
      source_coverage,
      source_fingerprint,
      validated_at
    ) values (
      (metric->>'metricId')::uuid,
      p_run_id,
      (metric->>'personId')::uuid,
      metric->'visiblePayload',
      (metric#>>'{visiblePayload,teamIpCents}')::bigint,
      nullif(metric#>>'{visiblePayload,teamRank,rank}', '')::integer,
      nullif(metric#>>'{visiblePayload,teamRank,population}', '')::integer,
      nullif(metric#>>'{visiblePayload,teamRankUnavailableReason}', ''),
      (metric#>>'{visiblePayload,activeWriters}')::integer,
      coalesce(array(
        select value::date
        from jsonb_array_elements_text(
          coalesce(metric#>'{sourceCoverage,activeWriterReportDates}', '[]'::jsonb)
        ) value
      ), array[]::date[]),
      nullif(metric#>>'{visiblePayload,firstLegPercent}', '')::numeric,
      nullif(metric#>>'{visiblePayload,averageMonthlyIpPerWriterCents}', '')::bigint,
      (metric#>>'{visiblePayload,monthCount}')::integer,
      nullif(metric#>>'{visiblePayload,growth,priorTeamIpCents}', '')::bigint,
      nullif(metric#>>'{visiblePayload,growth,percentage}', '')::numeric,
      metric#>>'{visiblePayload,growth,comparison}',
      (metric#>>'{visiblePayload,recruitsAdded}')::integer,
      (metric#>>'{visiblePayload,recruitingRank,rank}')::integer,
      (metric#>>'{visiblePayload,recruitingRank,population}')::integer,
      coalesce(metric#>'{visiblePayload,trend}', '[]'::jsonb),
      coalesce(metric->'sourceCoverage', '{}'::jsonb),
      md5(
        coalesce(metric->'visiblePayload', '{}'::jsonb)::text
        || '|'
        || coalesce(metric->'sourceCoverage', '{}'::jsonb)::text
      ),
      now()
    );
  end loop;

  if (select count(*) from producer_period_metric metric where metric.run_id = p_run_id and metric.validated_at is not null) <> producer_count
    or (select count(*) from builder_period_metric metric where metric.run_id = p_run_id and metric.validated_at is not null) <> builder_count
  then
    raise exception 'Automated validated metric rows do not match the frozen eligible population.';
  end if;

  update scorecard_metric_run
    set status = 'validating',
        eligible_producer_count = producer_count,
        eligible_builder_count = builder_count,
        checked_count = expected_count,
        passed_count = expected_count,
        failed_count = 0,
        held_count = 0,
        updated_at = now()
  where id = p_run_id;

  update scorecard_metric_run
    set status = 'ready',
        ready_at = now(),
        updated_at = now()
  where id = p_run_id;

  -- This is the one atomic publication boundary for the entire population.
  select count(*)::integer
    into published_snapshot_count
    from publish_scorecard_run(p_run_id, p_snapshots);

  if published_snapshot_count <> expected_count then
    raise exception 'Automated population publisher did not return every frozen Scorecard artifact.';
  end if;

  run_id := p_run_id;
  snapshot_count := published_snapshot_count;
  existing := false;
  return next;
end;
$$;

revoke all on function publish_gateway_complete_scorecard_population(
  uuid, text, date, date, text, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function publish_gateway_complete_scorecard_population(
  uuid, text, date, date, text, jsonb, jsonb, jsonb, jsonb
) to service_role;

notify pgrst, 'reload schema';
