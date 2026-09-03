-- Ticket #004: targeted, auditable correction publishing for an already-finalized
-- Scorecard. Corrections never mutate a frozen snapshot. They capture the current
-- canonical source truth in a new targeted run, point that run at the immediately
-- prior run, and publish only the changed card as the next revision.

create or replace function publish_manual_scorecard_correction(
  p_initiated_by uuid,
  p_prior_snapshot_id uuid,
  p_correction_reason text,
  p_metric_payload jsonb,
  p_published_payload jsonb,
  p_source_coverage jsonb,
  p_schedule_facts jsonb default '[]'::jsonb
)
returns table (
  snapshot_id uuid,
  run_id uuid,
  delivery_id uuid,
  existing boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_snapshot scorecard_snapshot%rowtype;
  lock_key text;
  target_fact record;
  latest_snapshot_id uuid;
  existing_snapshot_id uuid;
  existing_run_id uuid;
  existing_delivery_id uuid;
  created_run_id uuid;
  created_metric_id uuid;
  created_snapshot_id uuid;
  created_delivery_id uuid;
  next_revision integer;
  expected_end date;
  source_fingerprint text;
begin
  if nullif(btrim(coalesce(p_correction_reason, '')), '') is null
    or char_length(btrim(p_correction_reason)) < 5
    or char_length(btrim(p_correction_reason)) > 500
  then
    raise exception 'Correction reason must be between 5 and 500 characters.';
  end if;

  -- Defense in depth: only a canonical current admin/super-admin may create a
  -- correction, even though the RPC itself is service-role-only.
  if not exists (
    select 1 from person
    where id = p_initiated_by and (is_admin or is_super_admin)
  ) then
    raise exception 'Scorecard correction requires an authorized admin.';
  end if;

  select * into prior_snapshot
  from scorecard_snapshot
  where id = p_prior_snapshot_id
    and lifecycle_status in ('final', 'corrected')
    and finalized_at is not null
  for update;
  if not found then
    raise exception 'Correction requires a finalized prior Scorecard.';
  end if;
  if prior_snapshot.metric_run_id is null then
    raise exception 'Correction requires a prior Scorecard backed by a validated run.';
  end if;
  if prior_snapshot.card_type not in ('producer', 'builder')
    or prior_snapshot.period_kind not in ('monthly', 'quarterly', 'annual')
    or prior_snapshot.revision < 1
  then
    raise exception 'Prior Scorecard identity is not correctable.';
  end if;

  expected_end := case
    when prior_snapshot.period_kind = 'monthly' then (prior_snapshot.period_start + interval '1 month - 1 day')::date
    when prior_snapshot.period_kind = 'quarterly' then (prior_snapshot.period_start + interval '3 months - 1 day')::date
    else (prior_snapshot.period_start + interval '1 year - 1 day')::date
  end;
  if extract(day from prior_snapshot.period_start) <> 1
    or (prior_snapshot.period_kind = 'quarterly' and extract(month from prior_snapshot.period_start)::integer not in (1, 4, 7, 10))
    or (prior_snapshot.period_kind = 'annual' and extract(month from prior_snapshot.period_start)::integer <> 1)
    or prior_snapshot.period_end <> expected_end
  then
    raise exception 'Prior Scorecard is not an exact calendar period.';
  end if;

  next_revision := prior_snapshot.revision + 1;
  lock_key := concat_ws(
    ':',
    'scorecard-correction-v1',
    prior_snapshot.person_id::text,
    prior_snapshot.card_type,
    prior_snapshot.period_kind,
    prior_snapshot.period_start::text,
    next_revision::text
  );
  perform pg_advisory_xact_lock(hashtext(lock_key));

  -- A retry of the exact prior revision is idempotent. If another request already
  -- produced the next revision, return that canonical artifact rather than making
  -- a duplicate run or delivery.
  select snapshot.id, snapshot.metric_run_id, delivery.id
    into existing_snapshot_id, existing_run_id, existing_delivery_id
  from scorecard_snapshot snapshot
  left join scorecard_delivery delivery
    on delivery.snapshot_id = snapshot.id
    and delivery.delivery_type = case when prior_snapshot.card_type = 'producer' then 'producer_email' else 'builder_email' end
  where snapshot.person_id = prior_snapshot.person_id
    and snapshot.card_type = prior_snapshot.card_type
    and snapshot.period_kind = prior_snapshot.period_kind
    and snapshot.period_start = prior_snapshot.period_start
    and snapshot.period_end = prior_snapshot.period_end
    and snapshot.revision = next_revision
    and snapshot.prior_revision_id = p_prior_snapshot_id
    and snapshot.lifecycle_status = 'corrected'
    and snapshot.finalized_at is not null
  order by snapshot.finalized_at desc, snapshot.created_at desc
  limit 1;

  if existing_snapshot_id is not null then
    -- Idempotency is intentionally narrow: only an exact retry of the already-created
    -- correction may converge on that immutable artifact. A competing correction with
    -- a different reason or visible payload must surface as stale rather than silently
    -- claiming that its audit reason was recorded.
    if not exists (
      select 1
      from scorecard_snapshot snapshot
      where snapshot.id = existing_snapshot_id
        and (snapshot.kpi_results #- '{metricPayload,preview,generatedAt}') is not distinct from (p_published_payload #- '{metricPayload,preview,generatedAt}')
        and snapshot.correction_reason is not distinct from btrim(p_correction_reason)
        and snapshot.corrected_by = p_initiated_by
    ) then
      raise exception 'A newer Scorecard revision already exists. Correct the latest revision.';
    end if;

    snapshot_id := existing_snapshot_id;
    run_id := existing_run_id;
    delivery_id := existing_delivery_id;
    existing := true;
    return next;
    return;
  end if;

  -- Never branch correction history from a stale snapshot.
  select snapshot.id into latest_snapshot_id
  from scorecard_snapshot snapshot
  where snapshot.person_id = prior_snapshot.person_id
    and snapshot.card_type = prior_snapshot.card_type
    and snapshot.period_kind = prior_snapshot.period_kind
    and snapshot.period_start = prior_snapshot.period_start
    and snapshot.period_end = prior_snapshot.period_end
    and snapshot.lifecycle_status in ('final', 'corrected')
    and snapshot.finalized_at is not null
  order by snapshot.revision desc, snapshot.finalized_at desc, snapshot.created_at desc
  limit 1;
  if latest_snapshot_id is distinct from p_prior_snapshot_id then
    raise exception 'A newer Scorecard revision already exists. Correct the latest revision.';
  end if;

  -- Service code suppresses no-op corrections before this RPC, but the database is the
  -- final integrity boundary. Never create a revision that preserves the exact visible
  -- Scorecard payload, even if this function is invoked directly with service-role access.
  if (p_published_payload #- '{metricPayload,preview,generatedAt}') is not distinct from (prior_snapshot.kpi_results #- '{metricPayload,preview,generatedAt}') then
    raise exception 'Correction did not change published Scorecard values.';
  end if;

  if jsonb_typeof(coalesce(p_metric_payload, 'null'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_published_payload, 'null'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_source_coverage, 'null'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_schedule_facts, 'null'::jsonb)) <> 'array'
  then
    raise exception 'Correction payload shape is invalid.';
  end if;

  select * into target_fact
  from scorecard_manual_target_context(
    prior_snapshot.person_id,
    prior_snapshot.period_end,
    false
  )
  limit 1;
  if not found then
    raise exception 'Correction target has no historical period-end role fact.';
  end if;
  if not target_fact.active_at_period_end
    or (prior_snapshot.card_type = 'producer' and not target_fact.producer_at_period_end)
    or (prior_snapshot.card_type = 'builder' and not target_fact.builder_at_period_end)
  then
    raise exception 'Corrected Scorecard is not applicable to the target at period end.';
  end if;

  insert into scorecard_metric_run (
    period_kind,
    period_start,
    period_end,
    period_label,
    revision,
    prior_run_id,
    status,
    initiated_by,
    correction_reason,
    generation_scope,
    target_person_id,
    target_card_type,
    source_manifest
  ) values (
    prior_snapshot.period_kind,
    prior_snapshot.period_start,
    prior_snapshot.period_end,
    case
      when prior_snapshot.period_kind = 'monthly' then to_char(prior_snapshot.period_start, 'FMMonth YYYY')
      when prior_snapshot.period_kind = 'quarterly' then 'Q' || extract(quarter from prior_snapshot.period_start)::integer::text || ' ' || extract(year from prior_snapshot.period_start)::integer::text
      else extract(year from prior_snapshot.period_start)::integer::text
    end,
    next_revision,
    prior_snapshot.metric_run_id,
    'capturing',
    p_initiated_by,
    btrim(p_correction_reason),
    'manual_person',
    prior_snapshot.person_id,
    prior_snapshot.card_type,
    jsonb_build_object(
      'generationScope', 'manual_person',
      'correction', true,
      'priorSnapshotId', p_prior_snapshot_id,
      'priorRunId', prior_snapshot.metric_run_id,
      'targetPersonId', prior_snapshot.person_id,
      'targetCardType', prior_snapshot.card_type,
      'sourceCoverage', coalesce(p_source_coverage, '{}'::jsonb)
    )
  ) returning id into created_run_id;

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
    created_run_id,
    context.person_id,
    context.full_name,
    context.email,
    context.photo_url,
    context.upline_id,
    context.active_at_period_end,
    context.producer_at_period_end,
    context.builder_at_period_end
  from scorecard_manual_target_context(
    prior_snapshot.person_id,
    prior_snapshot.period_end,
    prior_snapshot.card_type = 'builder'
  ) context;

  source_fingerprint := md5(coalesce(p_metric_payload, '{}'::jsonb)::text || '|' || coalesce(p_source_coverage, '{}'::jsonb)::text);

  if prior_snapshot.card_type = 'producer' then
    insert into producer_period_metric (
      run_id,
      person_id,
      visible_payload,
      source_coverage,
      source_fingerprint,
      validated_at
    ) values (
      created_run_id,
      prior_snapshot.person_id,
      p_metric_payload,
      coalesce(p_source_coverage, '{}'::jsonb),
      source_fingerprint,
      now()
    ) returning id into created_metric_id;
  else
    insert into builder_period_metric (
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
      created_run_id,
      prior_snapshot.person_id,
      p_metric_payload,
      (p_metric_payload->>'teamIpCents')::bigint,
      nullif(p_metric_payload#>>'{teamRank,rank}', '')::integer,
      nullif(p_metric_payload#>>'{teamRank,population}', '')::integer,
      nullif(p_metric_payload->>'teamRankUnavailableReason', ''),
      (p_metric_payload->>'activeWriters')::integer,
      coalesce(array(
        select value::date
        from jsonb_array_elements_text(coalesce(p_source_coverage->'activeWriterReportDates', '[]'::jsonb)) value
      ), array[]::date[]),
      nullif(p_metric_payload->>'firstLegPercent', '')::numeric,
      nullif(p_metric_payload->>'averageMonthlyIpPerWriterCents', '')::bigint,
      (p_metric_payload->>'monthCount')::integer,
      nullif(p_metric_payload#>>'{growth,priorTeamIpCents}', '')::bigint,
      nullif(p_metric_payload#>>'{growth,percentage}', '')::numeric,
      p_metric_payload#>>'{growth,comparison}',
      (p_metric_payload->>'recruitsAdded')::integer,
      (p_metric_payload#>>'{recruitingRank,rank}')::integer,
      (p_metric_payload#>>'{recruitingRank,population}')::integer,
      coalesce(p_metric_payload->'trend', '[]'::jsonb),
      coalesce(p_source_coverage, '{}'::jsonb),
      source_fingerprint,
      now()
    ) returning id into created_metric_id;
  end if;

  update scorecard_metric_run
    set status = 'validating',
        eligible_producer_count = case when prior_snapshot.card_type = 'producer' then 1 else 0 end,
        eligible_builder_count = case when prior_snapshot.card_type = 'builder' then 1 else 0 end,
        checked_count = 1,
        passed_count = 1,
        failed_count = 0,
        held_count = 0,
        updated_at = now()
  where id = created_run_id;

  update scorecard_metric_run
    set status = 'ready', ready_at = now(), updated_at = now()
  where id = created_run_id;

  select published.snapshot_id, published.delivery_id
    into created_snapshot_id, created_delivery_id
  from publish_scorecard_run(
    created_run_id,
    jsonb_build_array(jsonb_build_object(
      'personId', prior_snapshot.person_id,
      'cardType', prior_snapshot.card_type,
      'metricId', created_metric_id,
      'sourceCoverage', coalesce(p_source_coverage, '{}'::jsonb),
      'visiblePayload', p_published_payload,
      'rankContext', null,
      'priorSnapshotId', p_prior_snapshot_id,
      'scheduleFacts', coalesce(p_schedule_facts, '[]'::jsonb)
    ))
  ) published
  limit 1;

  if created_snapshot_id is null then
    raise exception 'Correction publication did not return a snapshot.';
  end if;

  snapshot_id := created_snapshot_id;
  run_id := created_run_id;
  delivery_id := created_delivery_id;
  existing := false;
  return next;
end;
$$;

revoke all on function publish_manual_scorecard_correction(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function publish_manual_scorecard_correction(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb)
  to service_role;

notify pgrst, 'reload schema';