-- Whitelabel Ticket 2: customer-installation branding, onboarding policy, and carrier links.
-- These are non-secret settings that live with each deployed customer database.

create table if not exists public.installation_config (
  singleton boolean primary key default true check (singleton),
  organization_name text not null,
  short_name text not null,
  product_name text not null,
  metadata_description text not null,
  timezone text not null default 'America/Chicago',
  brand_primary_color text not null default '#C9A235' check (brand_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  brand_accent_color text not null default '#F6C945' check (brand_accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text not null default '/logo.png',
  favicon_url text not null default '/favicon.ico',
  support_email text not null default 'nicholasverge@gmail.com',
  reply_to_email text not null default 'nicholasverge@gmail.com',
  licensing_provider_name text not null default 'Xcel Solutions',
  licensing_code text not null default 'FFLALLSTAR-NGBNCR',
  licensing_login_url text not null default 'https://www.xcelsolutions.com/',
  licensing_requirements_url text not null default 'https://www.xcelsolutions.com/insurance-license/requirements',
  licensing_application_url text not null default 'https://www.sircon.com',
  graduation_policy_count integer not null default 8 check (graduation_policy_count between 1 and 1000),
  graduation_window_days integer not null default 28 check (graduation_window_days between 1 and 3650),
  stall_persisted_lapse_days integer not null default 3 check (stall_persisted_lapse_days between 1 and 365),
  stall_exam_unscheduled_days integer not null default 3 check (stall_exam_unscheduled_days between 1 and 365),
  stall_no_checkin_days integer not null default 2 check (stall_no_checkin_days between 1 and 365),
  stall_checkin_lapsed_days integer not null default 2 check (stall_checkin_lapsed_days between 1 and 365),
  updated_at timestamptz not null default now()
);

drop trigger if exists installation_config_updated_at on public.installation_config;
create trigger installation_config_updated_at
  before update on public.installation_config
  for each row execute function public.set_updated_at();

alter table public.installation_config enable row level security;
revoke all on table public.installation_config from anon, authenticated;
grant select, insert, update on table public.installation_config to service_role;

insert into public.installation_config (
  singleton, organization_name, short_name, product_name, metadata_description, timezone,
  brand_primary_color, brand_accent_color, logo_url, favicon_url, support_email, reply_to_email,
  licensing_provider_name, licensing_code, licensing_login_url, licensing_requirements_url, licensing_application_url,
  graduation_policy_count, graduation_window_days, stall_persisted_lapse_days,
  stall_exam_unscheduled_days, stall_no_checkin_days, stall_checkin_lapsed_days
) values (
  true, 'All Star Life Group', 'All Star', 'All Star OS', 'Recruiting pipeline for life-insurance organizations.', 'America/Chicago',
  '#C9A235', '#F6C945', '/logo.png', '/favicon.ico', 'nicholasverge@gmail.com', 'nicholasverge@gmail.com',
  'Xcel Solutions', 'FFLALLSTAR-NGBNCR', 'https://www.xcelsolutions.com/',
  'https://www.xcelsolutions.com/insurance-license/requirements', 'https://www.sircon.com',
  8, 28, 3, 3, 2, 2
) on conflict (singleton) do nothing;

create table if not exists public.installation_carrier_link (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  company_key text not null,
  display_name text not null,
  portal_url text not null check (portal_url ~ '^https://'),
  sort_order integer not null default 0,
  show_in_resources boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists installation_carrier_link_updated_at on public.installation_carrier_link;
create trigger installation_carrier_link_updated_at
  before update on public.installation_carrier_link
  for each row execute function public.set_updated_at();

alter table public.installation_carrier_link enable row level security;
revoke all on table public.installation_carrier_link from anon, authenticated;
grant select, insert, update, delete on table public.installation_carrier_link to service_role;

insert into public.installation_carrier_link (key, company_key, display_name, portal_url, sort_order, show_in_resources) values
  ('americo', 'americo', 'Americo', 'https://account.americoagent.com/Identity/Account/Login/?returnUrl=https%3a%2f%2ftools.americoagent.com%2f', 10, true),
  ('ethos', 'ethos', 'Ethos', 'https://agents.ethoslife.com/login', 20, true),
  ('mutual-of-omaha', 'mutual of omaha', 'Mutual Of Omaha', 'https://accounts.mutualofomaha.com/samlAuthnRequest', 30, true),
  ('nlg', 'national life group', 'NLG', 'https://www.nationallife.com/agent', 40, true),
  ('transamerica-express', 'transamerica', 'Transamerica Express', 'https://secure.transamerica.com/agenthome/#/', 50, true),
  ('transamerica-immediate-solutions', 'transamerica', 'Transamerica Immediate Solutions', 'https://secure.transamerica.com/agenthome/#/', 60, true),
  ('corebridge', 'corebridge', 'Corebridge', 'https://connext.corebridgefinancial.com/life/connext-portal/public/login', 70, true),
  ('aetna', 'aetna', 'Aetna', 'https://www.aetna.com/producer_public/login.fcc?icid=OLogin_nav_link', 80, true),
  ('american-amicable', 'american amicable', 'American Amicable', 'https://www.insuranceapplication.com/AppPage/index.html', 90, true)
on conflict (key) do nothing;

-- Canonical timezone for database-side business-date calculations. Existing
-- customer-safe functions are redefined below to call this instead of carrying
-- an All Star-specific timezone literal.
create or replace function public.installation_timezone() returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select timezone from public.installation_config where singleton = true),
    'America/Chicago'
  )
$$;

revoke all on function public.installation_timezone() from public, anon, authenticated;
grant execute on function public.installation_timezone() to service_role;

-- Graduation uses installation policy rather than the historical All Star literals.
create or replace function public.check_graduation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recruit recruit%rowtype;
  v_count int;
  v_policy_count int := 8;
  v_window_days int := 28;
begin
  select graduation_policy_count, graduation_window_days
    into v_policy_count, v_window_days
    from public.installation_config where singleton = true;

  select * into v_recruit from recruit where id = new.recruit_id;
  if v_recruit.phase <> 'bootcamp' then return new; end if;
  if v_recruit.bootcamp_started_at is null then return new; end if;

  select count(*) into v_count
    from policy_submission
    where recruit_id = new.recruit_id
      and submitted_at >= v_recruit.bootcamp_started_at
      and submitted_at < v_recruit.bootcamp_started_at + make_interval(days => v_window_days);

  if v_count >= v_policy_count then
    update recruit set phase = 'graduated', phase_step = null where id = new.recruit_id;
  end if;
  return new;
end;
$$;

create or replace function public.stall_lapse_days() returns int
language sql stable
set search_path = public
as $$
  select coalesce((select stall_persisted_lapse_days from public.installation_config where singleton = true), 3)
$$;

create or replace function public.compute_stalls()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold int := public.stall_lapse_days();
  v_policy_count int := 8;
  v_window_days int := 28;
  v_affected int := 0;
  v_recruit recruit%rowtype;
  v_last_checkin date;
  v_bootcamp_count int;
  v_should_flag boolean;
  v_reason text;
begin
  select graduation_policy_count, graduation_window_days
    into v_policy_count, v_window_days
    from public.installation_config where singleton = true;

  for v_recruit in select * from recruit where removed_at is null loop
    v_should_flag := false;
    v_reason := null;
    select max(check_in_date) into v_last_checkin from check_in where recruit_id = v_recruit.id;

    if v_recruit.phase = 'licensing' then
      if v_recruit.exam_date is null and v_recruit.created_at < now() - (v_threshold || ' days')::interval then
        v_should_flag := true; v_reason := 'exam not scheduled';
      elsif v_last_checkin is null and v_recruit.created_at < now() - (v_threshold || ' days')::interval then
        v_should_flag := true; v_reason := 'no check-ins yet';
      elsif v_last_checkin is not null and v_last_checkin < current_date - v_threshold then
        v_should_flag := true; v_reason := 'check-ins lapsed';
      end if;
    elsif v_recruit.phase = 'onboarding' then
      if v_last_checkin is not null and v_last_checkin < current_date - v_threshold then
        v_should_flag := true; v_reason := 'check-ins lapsed';
      end if;
    elsif v_recruit.phase = 'bootcamp' then
      if v_recruit.bootcamp_started_at is not null
         and v_recruit.bootcamp_started_at + make_interval(days => v_window_days) <= current_date then
        select count(*) into v_bootcamp_count from policy_submission
          where recruit_id = v_recruit.id
            and submitted_at >= v_recruit.bootcamp_started_at
            and submitted_at < v_recruit.bootcamp_started_at + make_interval(days => v_window_days);
        if v_bootcamp_count < v_policy_count then
          v_should_flag := true; v_reason := 'bootcamp gate missed';
        end if;
      elsif v_last_checkin is not null and v_last_checkin < current_date - v_threshold then
        v_should_flag := true; v_reason := 'check-ins lapsed';
      end if;
    end if;

    if v_should_flag <> v_recruit.flagged or coalesce(v_reason, '') <> coalesce(v_recruit.flag_reason, '') then
      update recruit set flagged = v_should_flag, flag_reason = case when v_should_flag then v_reason else null end
        where id = v_recruit.id;
      v_affected := v_affected + 1;
    end if;
  end loop;
  return v_affected;
end;
$$;


-- Scorecard business-date functions, preserved from the current implementation
-- except that the installation timezone replaces the historical All Star literal.


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
    select ((p_period_end + 1)::timestamp at time zone public.installation_timezone()) - interval '1 microsecond' as cutoff
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
  if p_period_end >= (now() at time zone public.installation_timezone())::date then
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
    select ((p_period_end + 1)::timestamp at time zone public.installation_timezone()) - interval '1 microsecond' as cutoff
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
          and coalesce(client.submit_date, client.date, (client.created_at at time zone public.installation_timezone())::date)
            between p_current_start and p_current_end
      ), 0)::bigint as current_ap_cents,
      coalesce(sum(round(client.annual_premium * 100)) filter (
        where coalesce(client.sale_status, 'sale') = 'sale'
          and coalesce(client.submit_date, client.date, (client.created_at at time zone public.installation_timezone())::date)
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
