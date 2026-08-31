-- Ticket #024: manual generation of exactly one historical Producer or Builder
-- Scorecard. Population runs retain their existing completeness semantics;
-- manual runs get an explicit target identity and still publish through the
-- canonical publish_scorecard_run transaction boundary.

alter table scorecard_metric_run
  add column generation_scope text not null default 'population',
  add column target_person_id uuid references person(id) on delete restrict,
  add column target_card_type text check (target_card_type in ('producer', 'builder'));

alter table scorecard_metric_run
  add constraint scorecard_metric_run_generation_scope_check check (
    (generation_scope = 'population' and target_person_id is null and target_card_type is null)
    or
    (generation_scope = 'manual_person' and target_person_id is not null and target_card_type is not null)
  );

-- Keep normal population identity exactly as before, while allowing one-person
-- runs for the same period without allowing duplicate manual identities.
drop index scorecard_metric_run_revision_idx;
create unique index scorecard_metric_run_revision_idx
  on scorecard_metric_run (period_kind, period_start, revision)
  where generation_scope = 'population';
create unique index scorecard_metric_run_manual_revision_idx
  on scorecard_metric_run (period_kind, period_start, target_person_id, target_card_type, revision)
  where generation_scope = 'manual_person';

create index scorecard_metric_run_manual_target_idx
  on scorecard_metric_run (target_person_id, period_start desc)
  where generation_scope = 'manual_person';

-- Resolve exactly the historical period-end hierarchy needed by a manual run.
-- Producer calls pass p_include_subtree=false and receive one row. Builder calls
-- pass true and receive only that Builder's recursive historical subtree.
create or replace function scorecard_manual_target_context(
  p_person_id uuid,
  p_period_end date,
  p_include_subtree boolean default false
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
  builder_at_period_end boolean,
  depth integer
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive
  params as (
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
  ),
  target_tree as (
    select fact.person_id, fact.upline_id, fact.status, fact.is_producer, fact.is_builder, 0 as depth,
      array[fact.person_id]::uuid[] as path
    from period_facts fact
    where fact.person_id = p_person_id

    union all

    select child.person_id, child.upline_id, child.status, child.is_producer, child.is_builder, parent.depth + 1,
      parent.path || child.person_id
    from period_facts child
    join target_tree parent
      on p_include_subtree
      and child.upline_id = parent.person_id
      and not child.person_id = any(parent.path)
  )
  select
    tree.person_id,
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
    tree.upline_id,
    tree.status = 'active' as active_at_period_end,
    tree.is_producer as producer_at_period_end,
    tree.is_builder as builder_at_period_end,
    tree.depth
  from target_tree tree
  join person on person.id = tree.person_id
  left join recruit on recruit.person_id = tree.person_id
  order by tree.depth, person.full_name, tree.person_id;
$$;

revoke all on function scorecard_manual_target_context(uuid, date, boolean) from public, anon, authenticated;
grant execute on function scorecard_manual_target_context(uuid, date, boolean) to service_role;
-- Bounded Gateway rows for the target or the target Builder's historical
-- subtree. This avoids materializing an organization-wide person list in Node.
create or replace function scorecard_manual_gateway_rows(
  p_person_id uuid,
  p_period_end date,
  p_report_start date,
  p_report_end date,
  p_include_subtree boolean default false
)
returns table (
  id uuid,
  import_id uuid,
  person_id uuid,
  report_date date,
  personal_ip_cents bigint,
  team_ip_cents bigint,
  first_leg_percent numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    premium.id,
    premium.import_id,
    premium.person_id,
    premium.report_date,
    premium.personal_ip_cents,
    premium.team_ip_cents,
    premium.first_leg_percent
  from producer_issued_premium premium
  join scorecard_manual_target_context(p_person_id, p_period_end, p_include_subtree) context
    on context.person_id = premium.person_id
  where premium.period_type = 'wtd'
    and premium.report_date between p_report_start and p_report_end
  order by premium.report_date, premium.person_id;
$$;

revoke all on function scorecard_manual_gateway_rows(uuid, date, date, date, boolean) from public, anon, authenticated;
grant execute on function scorecard_manual_gateway_rows(uuid, date, date, date, boolean) to service_role;

-- Builder team activity/AP support is aggregated in SQL over the same bounded
-- historical subtree. These are support facts only; they never become Producer
-- Scorecard metric rows or artifacts.
create or replace function scorecard_manual_builder_production_support(
  p_builder_id uuid,
  p_period_end date,
  p_current_start date,
  p_current_end date,
  p_prior_start date,
  p_prior_end date
)
returns table (
  person_id uuid,
  current_dials bigint,
  current_contacts bigint,
  current_presentations bigint,
  current_sales bigint,
  current_ap_cents bigint,
  prior_dials bigint,
  prior_contacts bigint,
  prior_presentations bigint,
  prior_sales bigint,
  prior_ap_cents bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with subtree as (
    select context.person_id
    from scorecard_manual_target_context(p_builder_id, p_period_end, true) context
  ),
  tracking as (
    select
      entry.person_id,
      coalesce(sum(entry.dials) filter (where entry.entry_date between p_current_start and p_current_end), 0)::bigint as current_dials,
      coalesce(sum(entry.contacts) filter (where entry.entry_date between p_current_start and p_current_end), 0)::bigint as current_contacts,
      coalesce(sum(entry.presentations) filter (where entry.entry_date between p_current_start and p_current_end), 0)::bigint as current_presentations,
      coalesce(sum(entry.sales) filter (where entry.entry_date between p_current_start and p_current_end), 0)::bigint as current_sales,
      coalesce(sum(entry.dials) filter (where entry.entry_date between p_prior_start and p_prior_end), 0)::bigint as prior_dials,
      coalesce(sum(entry.contacts) filter (where entry.entry_date between p_prior_start and p_prior_end), 0)::bigint as prior_contacts,
      coalesce(sum(entry.presentations) filter (where entry.entry_date between p_prior_start and p_prior_end), 0)::bigint as prior_presentations,
      coalesce(sum(entry.sales) filter (where entry.entry_date between p_prior_start and p_prior_end), 0)::bigint as prior_sales
    from tracker_entry entry
    join subtree on subtree.person_id = entry.person_id
    where entry.entry_date between least(p_current_start, p_prior_start) and greatest(p_current_end, p_prior_end)
    group by entry.person_id
  ),
  client_sales as (
    select
      client.person_id,
      coalesce(sum(round(client.annual_premium * 100)) filter (
        where coalesce(client.sale_status, 'sale') = 'sale'
          and coalesce(client.submit_date, client.date, (client.created_at at time zone 'America/Chicago')::date)
            between p_current_start and p_current_end
      ), 0)::bigint as current_ap_cents,
      coalesce(sum(round(client.annual_premium * 100)) filter (
        where coalesce(client.sale_status, 'sale') = 'sale'
          and coalesce(client.submit_date, client.date, (client.created_at at time zone 'America/Chicago')::date)
            between p_prior_start and p_prior_end
      ), 0)::bigint as prior_ap_cents
    from clients client
    join subtree on subtree.person_id = client.person_id
    where coalesce(client.sale_status, 'sale') = 'sale'
    group by client.person_id
  )
  select
    subtree.person_id,
    coalesce(tracking.current_dials, 0),
    coalesce(tracking.current_contacts, 0),
    coalesce(tracking.current_presentations, 0),
    coalesce(tracking.current_sales, 0),
    coalesce(client_sales.current_ap_cents, 0),
    coalesce(tracking.prior_dials, 0),
    coalesce(tracking.prior_contacts, 0),
    coalesce(tracking.prior_presentations, 0),
    coalesce(tracking.prior_sales, 0),
    coalesce(client_sales.prior_ap_cents, 0)
  from subtree
  left join tracking on tracking.person_id = subtree.person_id
  left join client_sales on client_sales.person_id = subtree.person_id
  order by subtree.person_id;
$$;

revoke all on function scorecard_manual_builder_production_support(uuid, date, date, date, date, date)
  from public, anon, authenticated;
grant execute on function scorecard_manual_builder_production_support(uuid, date, date, date, date, date)
  to service_role;

-- A manual run may reach ready only when its immutable counts and validated
-- metric rows prove that it contains exactly the requested card and nothing else.
create or replace function enforce_manual_scorecard_run_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  producer_rows integer;
  builder_rows integer;
begin
  if new.generation_scope <> 'manual_person'
    or new.status not in ('ready', 'generating', 'published', 'delivery_errors')
  then
    return new;
  end if;

  if new.target_person_id is null or new.target_card_type is null then
    raise exception 'Manual Scorecard runs require one target person and card type.';
  end if;

  if new.eligible_producer_count <> (case when new.target_card_type = 'producer' then 1 else 0 end)
    or new.eligible_builder_count <> (case when new.target_card_type = 'builder' then 1 else 0 end)
    or new.checked_count <> 1
    or new.passed_count <> 1
    or new.failed_count <> 0
    or new.held_count <> 0
  then
    raise exception 'Manual Scorecard run counts must describe exactly one validated target card.';
  end if;

  select count(*) into producer_rows
  from producer_period_metric
  where run_id = new.id and validated_at is not null;
  select count(*) into builder_rows
  from builder_period_metric
  where run_id = new.id and validated_at is not null;

  if (new.target_card_type = 'producer' and (producer_rows <> 1 or builder_rows <> 0))
    or (new.target_card_type = 'builder' and (producer_rows <> 0 or builder_rows <> 1))
  then
    raise exception 'Manual Scorecard run metric rows do not match the requested target card.';
  end if;

  if new.target_card_type = 'producer' and not exists (
    select 1 from producer_period_metric
    where run_id = new.id and person_id = new.target_person_id and validated_at is not null
  ) then
    raise exception 'Manual Producer metric does not match the target person.';
  end if;
  if new.target_card_type = 'builder' and not exists (
    select 1 from builder_period_metric
    where run_id = new.id and person_id = new.target_person_id and validated_at is not null
  ) then
    raise exception 'Manual Builder metric does not match the target person.';
  end if;

  return new;
end;
$$;

create trigger scorecard_metric_run_manual_scope_guard
  before insert or update on scorecard_metric_run
  for each row execute function enforce_manual_scorecard_run_scope();

-- Extend the existing transition immutability guard only for the three new
-- scope-identity columns; all pre-#024 transitions stay unchanged.
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
    or old.generation_scope is distinct from new.generation_scope
    or old.target_person_id is distinct from new.target_person_id
    or old.target_card_type is distinct from new.target_card_type
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

-- Atomically persist one already-prepared/independently-verified manual metric,
-- freeze the period-end target/support facts, and delegate publication to the
-- canonical publisher. The caller never inserts scorecard_snapshot or
-- scorecard_delivery directly.
create or replace function publish_manual_scorecard(
  p_initiated_by uuid,
  p_person_id uuid,
  p_card_type text,
  p_period_kind text,
  p_period_start date,
  p_period_end date,
  p_period_label text,
  p_revision integer,
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
  lock_key text;
  target_fact record;
  existing_snapshot_id uuid;
  existing_run_id uuid;
  existing_delivery_id uuid;
  created_run_id uuid;
  created_metric_id uuid;
  created_snapshot_id uuid;
  created_delivery_id uuid;
  expected_end date;
  source_fingerprint text;
begin
  if p_card_type not in ('producer', 'builder') then
    raise exception 'Unsupported manual Scorecard card type.';
  end if;
  if p_period_kind not in ('monthly', 'quarterly', 'annual') then
    raise exception 'Unsupported manual Scorecard period kind.';
  end if;
  if p_revision <> 1 then
    raise exception 'Ticket #024 manual generation supports revision 1 only.';
  end if;

  expected_end := case
    when p_period_kind = 'monthly' then (p_period_start + interval '1 month - 1 day')::date
    when p_period_kind = 'quarterly' then (p_period_start + interval '3 months - 1 day')::date
    else (p_period_start + interval '1 year - 1 day')::date
  end;
  if extract(day from p_period_start) <> 1
    or (p_period_kind = 'quarterly' and extract(month from p_period_start)::integer not in (1, 4, 7, 10))
    or (p_period_kind = 'annual' and extract(month from p_period_start)::integer <> 1)
    or p_period_end <> expected_end
  then
    raise exception 'Manual Scorecard period is not an exact calendar period.';
  end if;

  lock_key := concat_ws(':', 'scorecard-manual-v1', p_person_id::text, p_card_type, p_period_kind, p_period_start::text, p_revision::text);
  perform pg_advisory_xact_lock(hashtext(lock_key));

  -- Defense in depth: the service-role caller must still identify a canonical
  -- current admin/super-admin. Never rely on the browser or server action alone.
  if not exists (
    select 1 from person
    where id = p_initiated_by and (is_admin or is_super_admin)
  ) then
    raise exception 'Manual Scorecard generation requires an authorized admin.';
  end if;

  select * into target_fact
  from scorecard_manual_target_context(p_person_id, p_period_end, false)
  limit 1;
  if not found then
    raise exception 'Manual Scorecard target has no historical period-end role fact.';
  end if;
  if not target_fact.active_at_period_end
    or (p_card_type = 'producer' and not target_fact.producer_at_period_end)
    or (p_card_type = 'builder' and not target_fact.builder_at_period_end)
  then
    raise exception 'Requested manual Scorecard is not applicable to the target at period end.';
  end if;

  -- Any already-finalized revision with the same visible identity is canonical,
  -- regardless of whether it came from a population or manual run.
  select snapshot.id, snapshot.metric_run_id, delivery.id
    into existing_snapshot_id, existing_run_id, existing_delivery_id
  from scorecard_snapshot snapshot
  left join scorecard_delivery delivery
    on delivery.snapshot_id = snapshot.id
    and delivery.delivery_type = case when p_card_type = 'producer' then 'producer_email' else 'builder_email' end
  where snapshot.person_id = p_person_id
    and snapshot.card_type = p_card_type
    and snapshot.period_kind = p_period_kind
    and snapshot.period_start = p_period_start
    and snapshot.period_end = p_period_end
    and snapshot.revision = p_revision
    and snapshot.lifecycle_status in ('final', 'corrected')
  order by snapshot.finalized_at desc nulls last, snapshot.created_at desc
  limit 1;

  if existing_snapshot_id is not null then
    snapshot_id := existing_snapshot_id;
    run_id := existing_run_id;
    delivery_id := existing_delivery_id;
    existing := true;
    return next;
    return;
  end if;

  insert into scorecard_metric_run (
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
    p_period_kind,
    p_period_start,
    p_period_end,
    p_period_label,
    p_revision,
    'capturing',
    p_initiated_by,
    'manual_person',
    p_person_id,
    p_card_type,
    jsonb_build_object(
      'generationScope', 'manual_person',
      'targetPersonId', p_person_id,
      'targetCardType', p_card_type,
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
  from scorecard_manual_target_context(p_person_id, p_period_end, p_card_type = 'builder') context;

  source_fingerprint := md5(coalesce(p_metric_payload, '{}'::jsonb)::text || '|' || coalesce(p_source_coverage, '{}'::jsonb)::text);

  if p_card_type = 'producer' then
    insert into producer_period_metric (
      run_id,
      person_id,
      visible_payload,
      source_coverage,
      source_fingerprint,
      validated_at
    ) values (
      created_run_id,
      p_person_id,
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
      p_person_id,
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
        eligible_producer_count = case when p_card_type = 'producer' then 1 else 0 end,
        eligible_builder_count = case when p_card_type = 'builder' then 1 else 0 end,
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
      'personId', p_person_id,
      'cardType', p_card_type,
      'metricId', created_metric_id,
      'sourceCoverage', coalesce(p_source_coverage, '{}'::jsonb),
      'visiblePayload', p_published_payload,
      'rankContext', null,
      'scheduleFacts', coalesce(p_schedule_facts, '[]'::jsonb)
    ))
  ) published
  limit 1;

  if created_snapshot_id is null then
    raise exception 'Manual Scorecard publication did not return a snapshot.';
  end if;

  snapshot_id := created_snapshot_id;
  run_id := created_run_id;
  delivery_id := created_delivery_id;
  existing := false;
  return next;
end;
$$;

revoke all on function publish_manual_scorecard(uuid, uuid, text, text, date, date, text, integer, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function publish_manual_scorecard(uuid, uuid, text, text, date, date, text, integer, jsonb, jsonb, jsonb, jsonb)
  to service_role;

notify pgrst, 'reload schema';

-- #024 publisher ambiguity compatibility
-- The legacy RETURNS TABLE output named snapshot_id makes ON CONFLICT (snapshot_id, delivery_type)
-- ambiguous under PostgreSQL PL/pgSQL. Keep the canonical publisher unchanged except for using
-- the existing named unique constraint as the conflict target.
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
    on conflict on constraint scorecard_delivery_snapshot_id_delivery_type_key do update
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
