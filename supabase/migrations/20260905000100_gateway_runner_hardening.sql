-- Production hardening for the per-person Gateway runner contract.
--
-- This migration is intentionally corrective: previously-applied migrations are
-- left intact. It adds per-claim ownership fencing, personal-vs-legacy
-- provenance, and explicit Scorecard coverage metadata. No value is inferred
-- from gateway_label or report_date; the trusted runner must supply coverage
-- facts it obtained from Gateway.

alter table public.gateway_report_pull_job
  add column if not exists claim_token uuid;

-- A deployment can find jobs that were running under the old contract. Requeue
-- them so no pre-migration worker can retain write authority.
update public.gateway_report_pull_job
set status = 'queued',
    available_at = now(),
    claimed_at = null,
    lease_expires_at = null,
    claim_token = null,
    last_error = coalesce(last_error, 'runner_contract_upgraded')
where status = 'running';

alter table public.gateway_report_pull_job
  drop constraint if exists gateway_report_pull_job_claim_state_check;
alter table public.gateway_report_pull_job
  add constraint gateway_report_pull_job_claim_state_check check (
    (status = 'running' and claim_token is not null and claimed_at is not null and lease_expires_at is not null)
    or
    (status <> 'running' and claim_token is null and lease_expires_at is null)
  );

-- Reconnect never replays first-connect history. A failed/incomplete historical
-- pull may leave initial_backfill_completed_at null, but that is not permission
-- to backfill missed Mondays on a later session. Only the first successful
-- connection, before any first-connect job has ever been enqueued, gets the
-- retained 2026+ history job. Every later connection gets current WTD/MTD/YTD.
create or replace function public.enqueue_gateway_report_pull_after_connect(
  p_person_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.gateway_connection%rowtype;
  v_kind text;
  v_business_date date := (now() at time zone 'America/Chicago')::date;
  v_job_id uuid;
begin
  select * into v_connection
  from public.gateway_connection
  where person_id = p_person_id
  for update;

  if not found
     or v_connection.status <> 'connected'
     or nullif(btrim(coalesce(v_connection.session_ref, '')), '') is null then
    raise exception 'gateway_connection_not_ready_for_pull';
  end if;

  v_kind := case
    when v_connection.first_connected_at = v_connection.connected_at
      and not exists (
        select 1
        from public.gateway_report_pull_job prior
        where prior.person_id = p_person_id
          and prior.pull_kind = 'first_connect'
      )
      then 'first_connect'
    else 'reconnect'
  end;

  insert into public.gateway_report_pull_job (
    person_id, session_generation, pull_kind, business_date
  ) values (
    p_person_id, v_connection.session_generation, v_kind, v_business_date
  )
  on conflict (person_id, pull_kind, session_generation, business_date)
  do update set updated_at = excluded.updated_at
  returning id into v_job_id;

  return v_job_id;
end;
$$;

alter table public.gateway_issued_premium_import
  add column if not exists source_kind text,
  add column if not exists scorecard_period_start date,
  add column if not exists scorecard_period_end date,
  add column if not exists gateway_week_ordinal integer,
  add column if not exists gateway_period_final boolean;

update public.gateway_issued_premium_import
set source_kind = case
  when pull_job_id is not null and person_id is not null then 'personal_gateway'
  else 'legacy_agency'
end
where source_kind is null;

alter table public.gateway_issued_premium_import
  alter column source_kind set default 'legacy_agency',
  alter column source_kind set not null;

alter table public.gateway_issued_premium_import
  drop constraint if exists gateway_issued_premium_import_source_kind_check;
alter table public.gateway_issued_premium_import
  add constraint gateway_issued_premium_import_source_kind_check
  check (source_kind in ('legacy_agency', 'personal_gateway'));

alter table public.gateway_issued_premium_import
  drop constraint if exists gateway_issued_premium_import_scorecard_coverage_check;
alter table public.gateway_issued_premium_import
  add constraint gateway_issued_premium_import_scorecard_coverage_check check (
    (scorecard_period_start is null and scorecard_period_end is null and gateway_week_ordinal is null and gateway_period_final is null)
    or
    (
      scorecard_period_start is not null
      and scorecard_period_end is not null
      and scorecard_period_end >= scorecard_period_start
      and (
        (
          period_type = 'wtd'
          and gateway_week_ordinal between 1 and 8
          and gateway_period_final is not null
        )
        or
        (
          period_type in ('mtd', 'ytd')
          and gateway_week_ordinal is null
          and gateway_period_final is null
        )
      )
    )
  );

create index if not exists gateway_personal_scorecard_coverage_idx
  on public.gateway_issued_premium_import (
    source_kind, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, person_id
  )
  where source_kind = 'personal_gateway' and period_type = 'wtd';

-- The foundation-era checksum index assumed one agency-wide file per period.
-- Personal sessions can legitimately download identical report bytes, and the
-- no_new_report audit intentionally records repeated checksums. Keep legacy
-- agency dedupe without making personal audit history globally unique.
drop index if exists public.gateway_ip_import_checksum_idx;
create unique index if not exists gateway_ip_import_legacy_checksum_idx
  on public.gateway_issued_premium_import (period_type, source_checksum)
  where source_kind = 'legacy_agency' and source_checksum is not null;
create index if not exists gateway_ip_import_personal_checksum_lookup_idx
  on public.gateway_issued_premium_import (
    person_id, period_type, report_date, source_checksum, created_at desc
  )
  where source_kind = 'personal_gateway' and source_checksum is not null;

alter table public.producer_issued_premium
  add column if not exists source_kind text,
  add column if not exists scorecard_period_start date,
  add column if not exists scorecard_period_end date,
  add column if not exists gateway_week_ordinal integer,
  add column if not exists gateway_period_final boolean;

update public.producer_issued_premium premium
set source_kind = case
  when exists (
    select 1
    from public.gateway_issued_premium_import import
    where import.id = premium.import_id
      and import.source_kind = 'personal_gateway'
  ) then 'personal_gateway'
  else 'legacy_agency'
end
where source_kind is null;

alter table public.producer_issued_premium
  alter column source_kind set default 'legacy_agency',
  alter column source_kind set not null;

alter table public.producer_issued_premium
  drop constraint if exists producer_issued_premium_source_kind_check;
alter table public.producer_issued_premium
  add constraint producer_issued_premium_source_kind_check
  check (source_kind in ('legacy_agency', 'personal_gateway'));

alter table public.producer_issued_premium
  drop constraint if exists producer_issued_premium_scorecard_coverage_check;
alter table public.producer_issued_premium
  add constraint producer_issued_premium_scorecard_coverage_check check (
    (scorecard_period_start is null and scorecard_period_end is null and gateway_week_ordinal is null and gateway_period_final is null)
    or
    (
      scorecard_period_start is not null
      and scorecard_period_end is not null
      and scorecard_period_end >= scorecard_period_start
      and (
        (
          period_type = 'wtd'
          and gateway_week_ordinal between 1 and 8
          and gateway_period_final is not null
        )
        or
        (
          period_type in ('mtd', 'ytd')
          and gateway_week_ordinal is null
          and gateway_period_final is null
        )
      )
    )
  );

-- The original uniqueness key assumes report_date identifies a weekly bucket.
-- It is an acquisition/file date in the personal-runner contract, so delayed
-- pulls and multi-month first-connect history need a separate coverage identity.
alter table public.producer_issued_premium
  drop constraint if exists producer_issued_premium_person_id_period_type_report_date_key;

create unique index if not exists producer_issued_premium_legacy_unique_idx
  on public.producer_issued_premium (person_id, period_type, report_date)
  where source_kind = 'legacy_agency';

create unique index if not exists producer_issued_premium_personal_wtd_unique_idx
  on public.producer_issued_premium (person_id, scorecard_period_start, gateway_week_ordinal)
  where source_kind = 'personal_gateway'
    and period_type = 'wtd'
    and scorecard_period_start is not null
    and gateway_week_ordinal is not null;

create unique index if not exists producer_issued_premium_personal_snapshot_unique_idx
  on public.producer_issued_premium (person_id, period_type, scorecard_period_start, report_date)
  where source_kind = 'personal_gateway'
    and period_type in ('mtd', 'ytd')
    and scorecard_period_start is not null;

-- Compatibility only for rows written before explicit coverage metadata. New
-- personal imports are required to provide a covered period before they can
-- write numbers, but existing history remains addressable and deduplicated.
create unique index if not exists producer_issued_premium_personal_unscoped_unique_idx
  on public.producer_issued_premium (person_id, period_type, report_date)
  where source_kind = 'personal_gateway' and scorecard_period_start is null;

create index if not exists producer_issued_premium_personal_coverage_idx
  on public.producer_issued_premium (
    source_kind, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, person_id
  )
  where source_kind = 'personal_gateway' and period_type = 'wtd';

-- RETURNS TABLE changes require dropping the old function before recreating it.
drop function if exists public.claim_gateway_report_pull_job(integer);

create function public.claim_gateway_report_pull_job(
  p_lease_seconds integer default 1200
) returns table (
  id uuid,
  person_id uuid,
  pull_kind text,
  business_date date,
  session_generation bigint,
  session_ref text,
  attempt_count integer,
  claim_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.gateway_report_pull_job%rowtype;
  v_running integer := 0;
begin
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'invalid_gateway_pull_lease';
  end if;

  perform pg_advisory_xact_lock(2107, 7);

  update public.gateway_report_pull_job as j
  set status = 'failed',
      finished_at = now(),
      claimed_at = null,
      lease_expires_at = null,
      claim_token = null,
      last_error = coalesce(j.last_error, 'runner_lease_expired')
  where j.status = 'running'
    and j.lease_expires_at <= now()
    and j.attempt_count >= 3;

  update public.gateway_report_pull_job as j
  set status = 'queued',
      available_at = now(),
      claimed_at = null,
      lease_expires_at = null,
      claim_token = null,
      last_error = coalesce(j.last_error, 'runner_lease_expired')
  where j.status = 'running'
    and j.lease_expires_at <= now()
    and j.attempt_count < 3;

  update public.gateway_report_pull_job as j
  set status = 'cancelled',
      finished_at = coalesce(j.finished_at, now()),
      claimed_at = null,
      lease_expires_at = null,
      claim_token = null,
      last_error = coalesce(j.last_error, 'stale_or_disconnected_session')
  where j.status in ('queued', 'running')
    and not exists (
      select 1 from public.gateway_connection c
      where c.person_id = j.person_id
        and c.status = 'connected'
        and c.session_generation = j.session_generation
        and nullif(btrim(coalesce(c.session_ref, '')), '') is not null
    );

  select count(*) into v_running
  from public.gateway_report_pull_job j
  where j.status = 'running'
    and j.lease_expires_at > now();

  if v_running >= 4 then
    return;
  end if;

  select j.* into v_job
  from public.gateway_report_pull_job j
  join public.gateway_connection c
    on c.person_id = j.person_id
   and c.status = 'connected'
   and c.session_generation = j.session_generation
   and nullif(btrim(coalesce(c.session_ref, '')), '') is not null
  where j.status = 'queued'
    and j.available_at <= now()
    and not exists (
      select 1 from public.gateway_report_pull_job running
      where running.person_id = j.person_id
        and running.status = 'running'
        and running.lease_expires_at > now()
    )
  order by j.created_at asc, j.id asc
  for update of j skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.gateway_report_pull_job as j
  set status = 'running',
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = j.attempt_count + 1,
      claim_token = gen_random_uuid(),
      last_error = null
  where j.id = v_job.id;

  return query
  select j.id,
         j.person_id,
         j.pull_kind,
         j.business_date,
         j.session_generation,
         c.session_ref,
         j.attempt_count,
         j.claim_token,
         j.lease_expires_at
  from public.gateway_report_pull_job j
  join public.gateway_connection c on c.person_id = j.person_id
  where j.id = v_job.id;
end;
$$;

create or replace function public.renew_gateway_report_pull_job_lease(
  p_job_id uuid,
  p_session_generation bigint,
  p_claim_token uuid,
  p_lease_seconds integer default 1200
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expiry timestamptz;
begin
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'invalid_gateway_pull_lease';
  end if;

  update public.gateway_report_pull_job j
  set lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  where j.id = p_job_id
    and j.status = 'running'
    and j.session_generation = p_session_generation
    and j.claim_token = p_claim_token
    and j.lease_expires_at > now()
    and exists (
      select 1 from public.gateway_connection c
      where c.person_id = j.person_id
        and c.status = 'connected'
        and c.session_generation = p_session_generation
        and nullif(btrim(coalesce(c.session_ref, '')), '') is not null
    )
  returning j.lease_expires_at into v_expiry;

  return v_expiry;
end;
$$;

drop function if exists public.complete_gateway_report_pull_job(uuid, bigint, jsonb);

create function public.complete_gateway_report_pull_job(
  p_job_id uuid,
  p_session_generation bigint,
  p_claim_token uuid,
  p_summary jsonb default '{}'::jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.gateway_report_pull_job%rowtype;
  v_rows integer := 0;
begin
  select * into v_job
  from public.gateway_report_pull_job
  where id = p_job_id
  for update;

  if not found
     or v_job.status <> 'running'
     or v_job.session_generation <> p_session_generation
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at is null
     or v_job.lease_expires_at <= now() then
    return false;
  end if;

  if v_job.pull_kind in ('monday', 'reconnect') and exists (
    select 1
    from (values ('wtd'), ('mtd'), ('ytd')) required(period_type)
    where not exists (
      select 1
      from public.gateway_issued_premium_import i
      where i.pull_job_id = v_job.id
        and i.source_kind = 'personal_gateway'
        and i.period_type = required.period_type
        and i.status in ('imported', 'no_new_report')
    )
  ) then
    raise exception 'gateway_current_reports_incomplete';
  end if;

  update public.gateway_connection
  set last_verified_at = now(),
      initial_backfill_completed_at = case
        when v_job.pull_kind = 'first_connect' then coalesce(initial_backfill_completed_at, now())
        else initial_backfill_completed_at
      end
  where person_id = v_job.person_id
    and status = 'connected'
    and session_generation = p_session_generation;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    update public.gateway_report_pull_job
    set status = 'cancelled',
        finished_at = now(),
        claimed_at = null,
        lease_expires_at = null,
        claim_token = null,
        last_error = 'stale_completion'
    where id = p_job_id;
    return false;
  end if;

  update public.gateway_report_pull_job
  set status = 'succeeded',
      finished_at = now(),
      claimed_at = null,
      lease_expires_at = null,
      claim_token = null,
      summary = coalesce(p_summary, '{}'::jsonb),
      last_error = null
  where id = p_job_id;
  return true;
end;
$$;

drop function if exists public.import_gateway_personal_issued_premium(
  uuid, bigint, text, date, date, text, text, text,
  integer, integer, integer, jsonb, jsonb, text
);

create function public.import_gateway_personal_issued_premium(
  p_job_id uuid,
  p_session_generation bigint,
  p_claim_token uuid,
  p_period_type text,
  p_report_date date,
  p_period_start date,
  p_gateway_label text,
  p_source_file_name text,
  p_source_checksum text,
  p_rows_seen integer,
  p_unmatched_count integer,
  p_ambiguous_count integer,
  p_row jsonb default null,
  p_summary jsonb default '{}'::jsonb,
  p_skip_reason text default null,
  p_scorecard_period_start date default null,
  p_scorecard_period_end date default null,
  p_gateway_week_ordinal integer default null,
  p_gateway_period_final boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.gateway_report_pull_job%rowtype;
  v_connection public.gateway_connection%rowtype;
  v_import_id uuid;
  v_existing_id uuid;
  v_current_premium_import_id uuid;
  v_existing_checksum text;
  v_existing_period_start date;
  v_existing_period_end date;
  v_existing_gateway_label text;
  v_existing_period_final boolean;
  v_existing_matched_count integer;
  v_existing_unmatched_count integer;
  v_existing_ambiguous_count integer;
  v_existing_match_reason text;
  v_existing_week_start text;
  v_current_match_reason text := nullif(p_summary#>>'{samples,matchReason}', '');
  v_skip_reason text := nullif(btrim(coalesce(p_skip_reason, '')), '');
  v_matched_count integer := case when p_row is null then 0 else 1 end;
  v_premium_id uuid;
begin
  if p_summary->>'gatewayWeekStart' is not null then
    if p_period_type <> 'wtd' or p_scorecard_period_start is null
       or (p_summary->>'gatewayWeekStart') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'gateway_report_coverage_required';
    end if;
    perform (p_summary->>'gatewayWeekStart')::date;
  end if;

  if p_period_type not in ('wtd', 'mtd', 'ytd') then
    raise exception 'invalid_gateway_report_period';
  end if;
  if p_rows_seen < 0 or p_unmatched_count < 0 or p_ambiguous_count < 0 then
    raise exception 'invalid_gateway_report_counts';
  end if;
  if (p_scorecard_period_start is null) <> (p_scorecard_period_end is null) then
    raise exception 'incomplete_gateway_scorecard_coverage';
  end if;
  if p_period_type = 'wtd' then
    if p_scorecard_period_start is null and v_skip_reason is null then
      raise exception 'gateway_wtd_coverage_required';
    end if;
    if p_scorecard_period_start is not null and (
       p_gateway_week_ordinal is null
       or p_gateway_period_final is null
    ) then
      raise exception 'gateway_wtd_coverage_required';
    end if;
    if p_scorecard_period_start is not null and (
       p_scorecard_period_end < p_scorecard_period_start
       or extract(day from p_scorecard_period_start) <> 1
       or p_scorecard_period_end <> (p_scorecard_period_start + interval '1 month - 1 day')::date
       or p_gateway_week_ordinal not between 1 and 8
    ) then
      raise exception 'invalid_gateway_scorecard_coverage';
    end if;
    if p_scorecard_period_start is null and (
       p_scorecard_period_end is not null
       or p_gateway_week_ordinal is not null
       or p_gateway_period_final is not null
    ) then
      raise exception 'incomplete_gateway_scorecard_coverage';
    end if;
  else
    if p_gateway_week_ordinal is not null or p_gateway_period_final is not null then
      raise exception 'gateway_week_metadata_only_valid_for_wtd';
    end if;
    if p_scorecard_period_start is not null then
      if p_scorecard_period_end < p_scorecard_period_start
         or (
           p_period_type = 'mtd'
           and (
             extract(day from p_scorecard_period_start) <> 1
             or p_scorecard_period_end <> (p_scorecard_period_start + interval '1 month - 1 day')::date
           )
         )
         or (
           p_period_type = 'ytd'
           and (
             extract(month from p_scorecard_period_start) <> 1
             or extract(day from p_scorecard_period_start) <> 1
             or p_scorecard_period_end <> (p_scorecard_period_start + interval '1 year - 1 day')::date
           )
         ) then
        raise exception 'invalid_gateway_scorecard_coverage';
      end if;
    elsif v_skip_reason is null then
      raise exception 'gateway_report_coverage_required';
    end if;
  end if;

  select * into v_job
  from public.gateway_report_pull_job
  where id = p_job_id
  for update;

  if not found
     or v_job.status <> 'running'
     or v_job.session_generation <> p_session_generation
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at is null
     or v_job.lease_expires_at <= now() then
    raise exception 'stale_gateway_report_pull_job';
  end if;

  select * into v_connection
  from public.gateway_connection
  where person_id = v_job.person_id
  for update;

  if not found
     or v_connection.status <> 'connected'
     or v_connection.session_generation <> p_session_generation
     or nullif(btrim(coalesce(v_connection.session_ref, '')), '') is null then
    raise exception 'stale_gateway_report_pull_session';
  end if;

  if not exists (
    select 1 from public.person p
    where p.id = v_job.person_id
      and p.status = 'active'
      and (p.is_producer or p.is_builder)
  ) then
    raise exception 'gateway_person_not_eligible_for_pull';
  end if;

  -- The product's retained personal history starts in 2026. The cutoff follows
  -- the covered period, never the acquisition/report date. Unknown first-connect
  -- coverage is retained as a skipped audit instead of being guessed.
  if p_scorecard_period_start is not null and p_scorecard_period_start < date '2026-01-01' then
    v_skip_reason := 'covered_period_before_2026';
  elsif v_job.pull_kind = 'first_connect' and p_scorecard_period_start is null then
    v_skip_reason := 'first_connect_period_unknown';
  end if;

  if v_skip_reason is not null then
    insert into public.gateway_issued_premium_import (
      person_id, pull_job_id, session_generation, pull_kind, source_kind,
      period_type, status, report_date, period_start, gateway_label,
      source_file_name, source_checksum, rows_seen, matched_count,
      unmatched_count, ambiguous_count, skipped_count, summary, created_at, finished_at,
      scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final
    ) values (
      v_job.person_id, v_job.id, p_session_generation, v_job.pull_kind, 'personal_gateway',
      p_period_type, 'skipped', p_report_date, p_period_start, p_gateway_label,
      p_source_file_name, p_source_checksum, p_rows_seen, 0,
      p_unmatched_count, p_ambiguous_count, p_rows_seen,
      coalesce(p_summary, '{}'::jsonb) || jsonb_build_object('reason', left(v_skip_reason, 200)),
      clock_timestamp(), clock_timestamp(), p_scorecard_period_start, p_scorecard_period_end, p_gateway_week_ordinal, p_gateway_period_final
    ) returning id into v_import_id;

    return jsonb_build_object('status', 'skipped', 'importId', v_import_id);
  end if;

  -- Prefer the audit that currently owns the premium row for this exact report
  -- identity. This is the durable current-state pointer and avoids relying on
  -- transaction timestamps (now() is constant inside a transaction), which can
  -- otherwise make A -> B -> A incorrectly select historical A as "latest".
  select premium.import_id into v_current_premium_import_id
  from public.producer_issued_premium premium
  where premium.person_id = v_job.person_id
    and premium.source_kind = 'personal_gateway'
    and premium.period_type = p_period_type
    and (
      (
        p_scorecard_period_start is not null
        and premium.scorecard_period_start = p_scorecard_period_start
        and (
          (p_period_type = 'wtd' and premium.gateway_week_ordinal = p_gateway_week_ordinal)
          or (p_period_type in ('mtd', 'ytd') and premium.report_date = p_report_date)
        )
      )
      or
      (
        p_scorecard_period_start is null
        and premium.scorecard_period_start is null
        and premium.report_date = p_report_date
      )
    )
  order by premium.updated_at desc, premium.id desc
  limit 1;

  if v_current_premium_import_id is not null then
    select
      i.id,
      i.source_checksum,
      i.period_start,
      i.scorecard_period_end,
      i.gateway_label,
      i.gateway_period_final,
      i.matched_count,
      i.unmatched_count,
      i.ambiguous_count,
      nullif(i.summary#>>'{samples,matchReason}', ''),
    i.summary->>'gatewayWeekStart'
    into
      v_existing_id,
      v_existing_checksum,
      v_existing_period_start,
      v_existing_period_end,
      v_existing_gateway_label,
      v_existing_period_final,
      v_existing_matched_count,
      v_existing_unmatched_count,
      v_existing_ambiguous_count,
      v_existing_match_reason,
    v_existing_week_start
    from public.gateway_issued_premium_import i
    where i.id = v_current_premium_import_id
      and i.status = 'imported';
  end if;

  -- Verified-zero and unresolved current states do not have to own a premium
  -- row, so fall back to the most recent imported audit for this identity. New
  -- writes use clock_timestamp() to preserve order even inside one transaction.
  if v_existing_id is null then
    select
    i.id,
    i.source_checksum,
    i.period_start,
    i.scorecard_period_end,
    i.gateway_label,
    i.gateway_period_final,
    i.matched_count,
    i.unmatched_count,
    i.ambiguous_count,
    nullif(i.summary#>>'{samples,matchReason}', ''),
    i.summary->>'gatewayWeekStart'
  into
    v_existing_id,
    v_existing_checksum,
    v_existing_period_start,
    v_existing_period_end,
    v_existing_gateway_label,
    v_existing_period_final,
    v_existing_matched_count,
    v_existing_unmatched_count,
    v_existing_ambiguous_count,
    v_existing_match_reason,
    v_existing_week_start
    from public.gateway_issued_premium_import i
    where i.person_id = v_job.person_id
      and i.source_kind = 'personal_gateway'
      and i.period_type = p_period_type
      and i.status = 'imported'
      and (
        (
          p_scorecard_period_start is not null
          and i.scorecard_period_start = p_scorecard_period_start
          and (
            (p_period_type = 'wtd' and i.gateway_week_ordinal = p_gateway_week_ordinal)
            or (p_period_type in ('mtd', 'ytd') and i.report_date = p_report_date)
          )
        )
        or
        (
          p_scorecard_period_start is null
          and i.scorecard_period_start is null
          and i.report_date = p_report_date
        )
      )
    order by i.created_at desc, i.id desc
    limit 1;
  end if;

  if v_existing_id is not null
     and v_existing_checksum is not distinct from p_source_checksum
     and v_existing_period_start is not distinct from p_period_start
     and v_existing_period_end is not distinct from p_scorecard_period_end
     and v_existing_gateway_label is not distinct from p_gateway_label
     and v_existing_period_final is not distinct from p_gateway_period_final
     and v_existing_week_start is not distinct from (p_summary->>'gatewayWeekStart')
     and v_existing_matched_count = v_matched_count
     and v_existing_unmatched_count = p_unmatched_count
     and v_existing_ambiguous_count = p_ambiguous_count
     and v_existing_match_reason is not distinct from v_current_match_reason then
    insert into public.gateway_issued_premium_import (
      person_id, pull_job_id, session_generation, pull_kind, source_kind,
      period_type, status, report_date, period_start, gateway_label,
      source_file_name, source_checksum, rows_seen, matched_count,
      unmatched_count, ambiguous_count, skipped_count, summary, created_at, finished_at,
      scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final
    ) values (
      v_job.person_id, v_job.id, p_session_generation, v_job.pull_kind, 'personal_gateway',
      p_period_type, 'no_new_report', p_report_date, p_period_start, p_gateway_label,
      p_source_file_name, p_source_checksum, p_rows_seen, 0,
      p_unmatched_count, p_ambiguous_count, p_rows_seen,
      coalesce(p_summary, '{}'::jsonb) || jsonb_build_object(
        'reason', 'same_report_checksum_already_imported',
        'existingImportId', v_existing_id
      ),
      clock_timestamp(), clock_timestamp(), p_scorecard_period_start, p_scorecard_period_end, p_gateway_week_ordinal, p_gateway_period_final
    ) returning id into v_import_id;

    return jsonb_build_object('status', 'no_new_report', 'importId', v_import_id);
  end if;

  insert into public.gateway_issued_premium_import (
    person_id, pull_job_id, session_generation, pull_kind, source_kind,
    period_type, status, report_date, period_start, gateway_label,
    source_file_name, source_checksum, rows_seen, matched_count,
    unmatched_count, ambiguous_count, skipped_count, summary, created_at,
    scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final
  ) values (
    v_job.person_id, v_job.id, p_session_generation, v_job.pull_kind, 'personal_gateway',
    p_period_type, 'pending', p_report_date, p_period_start, p_gateway_label,
    p_source_file_name, p_source_checksum, p_rows_seen, v_matched_count,
    p_unmatched_count, p_ambiguous_count,
    greatest(0, p_rows_seen - v_matched_count), coalesce(p_summary, '{}'::jsonb), clock_timestamp(),
    p_scorecard_period_start, p_scorecard_period_end, p_gateway_week_ordinal, p_gateway_period_final
  ) returning id into v_import_id;

  if p_row is not null then
    if p_period_type = 'wtd' and p_scorecard_period_start is not null then
      update public.producer_issued_premium
      set import_id = v_import_id,
          report_date = p_report_date,
          period_start = p_period_start,
          gateway_label = p_gateway_label,
          gateway_producer = nullif(p_row->>'producer', ''),
          gateway_npn = nullif(p_row->>'producerNpn', ''),
          gateway_email = nullif(p_row->>'email', ''),
          gateway_upline = nullif(p_row->>'upline', ''),
          gateway_upline_npn = nullif(p_row->>'uplineNpn', ''),
          gateway_agency = nullif(p_row->>'agency', ''),
          personal_ip_cents = coalesce((p_row->>'personalIpCents')::bigint, 0),
          team_ip_cents = coalesce((p_row->>'teamIpCents')::bigint, 0),
          first_leg_producer = nullif(p_row->>'firstLegProducer', ''),
          first_leg_npn = nullif(p_row->>'firstLegNpn', ''),
          first_leg_percent = case when nullif(p_row->>'firstLegPercent', '') is null then null else (p_row->>'firstLegPercent')::numeric end,
          outside_first_leg_cents = coalesce((p_row->>'outsideFirstLegCents')::bigint, 0),
          scorecard_period_end = p_scorecard_period_end,
          gateway_period_final = p_gateway_period_final,
          updated_at = now()
      where person_id = v_job.person_id
        and source_kind = 'personal_gateway'
        and period_type = 'wtd'
        and scorecard_period_start = p_scorecard_period_start
        and gateway_week_ordinal = p_gateway_week_ordinal
      returning id into v_premium_id;
    elsif p_scorecard_period_start is not null then
      update public.producer_issued_premium
      set import_id = v_import_id,
          report_date = p_report_date,
          period_start = p_period_start,
          gateway_label = p_gateway_label,
          gateway_producer = nullif(p_row->>'producer', ''),
          gateway_npn = nullif(p_row->>'producerNpn', ''),
          gateway_email = nullif(p_row->>'email', ''),
          gateway_upline = nullif(p_row->>'upline', ''),
          gateway_upline_npn = nullif(p_row->>'uplineNpn', ''),
          gateway_agency = nullif(p_row->>'agency', ''),
          personal_ip_cents = coalesce((p_row->>'personalIpCents')::bigint, 0),
          team_ip_cents = coalesce((p_row->>'teamIpCents')::bigint, 0),
          first_leg_producer = nullif(p_row->>'firstLegProducer', ''),
          first_leg_npn = nullif(p_row->>'firstLegNpn', ''),
          first_leg_percent = case when nullif(p_row->>'firstLegPercent', '') is null then null else (p_row->>'firstLegPercent')::numeric end,
          outside_first_leg_cents = coalesce((p_row->>'outsideFirstLegCents')::bigint, 0),
          scorecard_period_end = p_scorecard_period_end,
          updated_at = now()
      where person_id = v_job.person_id
        and source_kind = 'personal_gateway'
        and period_type = p_period_type
        and scorecard_period_start = p_scorecard_period_start
        and report_date = p_report_date
      returning id into v_premium_id;
    else
      update public.producer_issued_premium
      set import_id = v_import_id,
          period_start = p_period_start,
          gateway_label = p_gateway_label,
          gateway_producer = nullif(p_row->>'producer', ''),
          gateway_npn = nullif(p_row->>'producerNpn', ''),
          gateway_email = nullif(p_row->>'email', ''),
          gateway_upline = nullif(p_row->>'upline', ''),
          gateway_upline_npn = nullif(p_row->>'uplineNpn', ''),
          gateway_agency = nullif(p_row->>'agency', ''),
          personal_ip_cents = coalesce((p_row->>'personalIpCents')::bigint, 0),
          team_ip_cents = coalesce((p_row->>'teamIpCents')::bigint, 0),
          first_leg_producer = nullif(p_row->>'firstLegProducer', ''),
          first_leg_npn = nullif(p_row->>'firstLegNpn', ''),
          first_leg_percent = case when nullif(p_row->>'firstLegPercent', '') is null then null else (p_row->>'firstLegPercent')::numeric end,
          outside_first_leg_cents = coalesce((p_row->>'outsideFirstLegCents')::bigint, 0),
          updated_at = now()
      where person_id = v_job.person_id
        and source_kind = 'personal_gateway'
        and period_type = p_period_type
        and scorecard_period_start is null
        and report_date = p_report_date
      returning id into v_premium_id;
    end if;

    if v_premium_id is null then
      insert into public.producer_issued_premium (
        person_id, import_id, source_kind, period_type, report_date, period_start, gateway_label,
        gateway_producer, gateway_npn, gateway_email, gateway_upline,
        gateway_upline_npn, gateway_agency, personal_ip_cents, team_ip_cents,
        first_leg_producer, first_leg_npn, first_leg_percent, outside_first_leg_cents,
        scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final
      ) values (
        v_job.person_id, v_import_id, 'personal_gateway', p_period_type, p_report_date, p_period_start, p_gateway_label,
        nullif(p_row->>'producer', ''), nullif(p_row->>'producerNpn', ''), nullif(p_row->>'email', ''), nullif(p_row->>'upline', ''),
        nullif(p_row->>'uplineNpn', ''), nullif(p_row->>'agency', ''),
        coalesce((p_row->>'personalIpCents')::bigint, 0), coalesce((p_row->>'teamIpCents')::bigint, 0),
        nullif(p_row->>'firstLegProducer', ''), nullif(p_row->>'firstLegNpn', ''),
        case when nullif(p_row->>'firstLegPercent', '') is null then null else (p_row->>'firstLegPercent')::numeric end,
        coalesce((p_row->>'outsideFirstLegCents')::bigint, 0),
        p_scorecard_period_start, p_scorecard_period_end, p_gateway_week_ordinal, p_gateway_period_final
      );
    end if;

    update public.person
    set npn_status = 'verified',
        npn_source = 'gateway_csv',
        npn_verified_at = now()
    where id = v_job.person_id
      and npn_status = 'submitted';
  elsif v_current_match_reason = 'target_npn_not_present' then
    delete from public.producer_issued_premium premium
    where premium.person_id = v_job.person_id
      and premium.source_kind = 'personal_gateway'
      and premium.period_type = p_period_type
      and (
        (
          p_scorecard_period_start is not null
          and premium.scorecard_period_start = p_scorecard_period_start
          and (
            (p_period_type = 'wtd' and premium.gateway_week_ordinal = p_gateway_week_ordinal)
            or (p_period_type in ('mtd', 'ytd') and premium.report_date = p_report_date)
          )
        )
        or
        (
          p_scorecard_period_start is null
          and premium.scorecard_period_start is null
          and premium.report_date = p_report_date
        )
      );
  end if;

  update public.gateway_issued_premium_import
  set status = 'imported', finished_at = clock_timestamp()
  where id = v_import_id;

  return jsonb_build_object('status', 'imported', 'importId', v_import_id);
end;
$$;

drop function if exists public.fail_gateway_report_pull_job(uuid, bigint, text, boolean, boolean);

create function public.fail_gateway_report_pull_job(
  p_job_id uuid,
  p_session_generation bigint,
  p_claim_token uuid,
  p_error text default null,
  p_needs_reconnect boolean default false,
  p_retryable boolean default false
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.gateway_report_pull_job%rowtype;
  v_error text := nullif(left(coalesce(p_error, ''), 500), '');
  v_invalidated boolean := false;
begin
  select * into v_job
  from public.gateway_report_pull_job
  where id = p_job_id
  for update;

  if not found
     or v_job.status <> 'running'
     or v_job.session_generation <> p_session_generation
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at is null
     or v_job.lease_expires_at <= now() then
    return 'stale';
  end if;

  if p_needs_reconnect then
    select public.mark_gateway_connection_needs_reconnect(
      v_job.person_id,
      p_session_generation,
      v_error
    ) into v_invalidated;

    update public.gateway_report_pull_job
    set status = case when v_invalidated then 'needs_reconnect' else 'cancelled' end,
        finished_at = now(),
        claimed_at = null,
        lease_expires_at = null,
        claim_token = null,
        last_error = coalesce(v_error, 'gateway_session_invalid')
    where id = p_job_id;
    return case when v_invalidated then 'needs_reconnect' else 'stale' end;
  end if;

  if p_retryable and v_job.attempt_count < 3 and exists (
    select 1 from public.gateway_connection c
    where c.person_id = v_job.person_id
      and c.status = 'connected'
      and c.session_generation = p_session_generation
  ) then
    update public.gateway_report_pull_job
    set status = 'queued',
        available_at = now() + interval '5 minutes',
        claimed_at = null,
        lease_expires_at = null,
        claim_token = null,
        last_error = v_error
    where id = p_job_id;
    return 'queued';
  end if;

  update public.gateway_report_pull_job
  set status = 'failed',
      finished_at = now(),
      claimed_at = null,
      lease_expires_at = null,
      claim_token = null,
      last_error = v_error
  where id = p_job_id;
  return 'failed';
end;
$$;

revoke all on function public.claim_gateway_report_pull_job(integer) from public, anon, authenticated;
revoke all on function public.renew_gateway_report_pull_job_lease(uuid, bigint, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_gateway_report_pull_job(uuid, bigint, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.import_gateway_personal_issued_premium(
  uuid, bigint, uuid, text, date, date, text, text, text,
  integer, integer, integer, jsonb, jsonb, text, date, date, integer, boolean
) from public, anon, authenticated;
revoke all on function public.fail_gateway_report_pull_job(uuid, bigint, uuid, text, boolean, boolean) from public, anon, authenticated;

grant execute on function public.claim_gateway_report_pull_job(integer) to service_role;
grant execute on function public.renew_gateway_report_pull_job_lease(uuid, bigint, uuid, integer) to service_role;
grant execute on function public.complete_gateway_report_pull_job(uuid, bigint, uuid, jsonb) to service_role;
grant execute on function public.import_gateway_personal_issued_premium(
  uuid, bigint, uuid, text, date, date, text, text, text,
  integer, integer, integer, jsonb, jsonb, text, date, date, integer, boolean
) to service_role;
grant execute on function public.fail_gateway_report_pull_job(uuid, bigint, uuid, text, boolean, boolean) to service_role;

-- The manual Scorecard adapter must consume the same personal provenance and
-- covered-week identity as automatic publication. Existing unscoped personal
-- history remains available through the report_date fallback only.
drop function if exists public.scorecard_manual_gateway_rows(uuid, date, date, date, boolean);
create function public.scorecard_manual_gateway_rows(
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
  source_kind text,
  report_date date,
  period_start date,
  scorecard_period_start date,
  scorecard_period_end date,
  gateway_week_ordinal integer,
  gateway_period_final boolean,
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
    premium.source_kind,
    premium.report_date,
    premium.period_start,
    premium.scorecard_period_start,
    premium.scorecard_period_end,
    premium.gateway_week_ordinal,
    premium.gateway_period_final,
    premium.personal_ip_cents,
    premium.team_ip_cents,
    premium.first_leg_percent
  from producer_issued_premium premium
  join scorecard_manual_target_context(p_person_id, p_period_end, p_include_subtree) context
    on context.person_id = premium.person_id
  where premium.period_type = 'wtd'
    and premium.source_kind = 'personal_gateway'
    and (
      (
        premium.scorecard_period_start is not null
        and premium.scorecard_period_start between date_trunc('month', p_report_start::timestamp)::date and p_report_end
      )
      or
      (
        premium.scorecard_period_start is null
        and premium.report_date between p_report_start and p_report_end
      )
    )
  order by coalesce(premium.period_start, premium.report_date), premium.person_id, premium.id;
$$;
revoke all on function public.scorecard_manual_gateway_rows(uuid, date, date, date, boolean) from public, anon, authenticated;
grant execute on function public.scorecard_manual_gateway_rows(uuid, date, date, date, boolean) to service_role;

-- Durable operator ledger for final-week discovery and delayed publication.
-- A first-connect backfill is never allowed to populate this table; the app only
-- discovers automatic periods from ongoing Monday/reconnect final-week evidence
-- or from the immediately-closed calendar hint.
create table if not exists public.scorecard_auto_publish_period (
  period_kind text not null check (period_kind in ('monthly', 'quarterly', 'annual')),
  period_start date not null,
  period_end date not null,
  period_label text not null,
  status text not null default 'waiting' check (status in ('waiting', 'published', 'blocked', 'failed')),
  discovered_at timestamptz not null default now(),
  last_evaluated_at timestamptz,
  published_at timestamptz,
  run_id uuid references public.scorecard_metric_run(id) on delete set null,
  member_decisions jsonb not null default '[]'::jsonb,
  last_reason text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (period_kind, period_start),
  check (period_end >= period_start),
  check (jsonb_typeof(member_decisions) = 'array')
);

create index if not exists scorecard_auto_publish_period_status_idx
  on public.scorecard_auto_publish_period (status, period_start, period_kind);

alter table public.scorecard_auto_publish_period enable row level security;
grant all on public.scorecard_auto_publish_period to service_role;

-- Automatic publication with explicit per-card eligibility. The full frozen
-- roster is still captured in person_role_status_fact. Only the subset whose
-- decisions are eligible becomes the run's validated/published metric set.
create or replace function public.publish_gateway_eligible_scorecard_population(
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
  frozen_producer_count integer;
  frozen_builder_count integer;
  frozen_card_count integer;
  decision_count integer;
  producer_count integer;
  builder_count integer;
  expected_count integer;
  supplied_producer_count integer;
  supplied_builder_count integer;
  supplied_snapshot_count integer;
  published_snapshot_count integer;
  metric jsonb;
  decisions jsonb := coalesce(p_source_manifest->'memberDecisions', 'null'::jsonb);
begin
  if p_run_id is null then
    raise exception 'Automated Scorecard publication requires a run id.';
  end if;
  if p_period_kind not in ('monthly', 'quarterly', 'annual') then
    raise exception 'Automated Scorecard publication requires a canonical period kind.';
  end if;
  if p_period_end < p_period_start or extract(day from p_period_start) <> 1 then
    raise exception 'Automated Scorecard publication requires canonical ordered dates.';
  end if;
  if p_period_kind = 'monthly'
     and p_period_end <> (p_period_start + interval '1 month - 1 day')::date then
    raise exception 'Automated monthly Scorecard dates are not canonical.';
  end if;
  if p_period_kind = 'quarterly'
     and (
       extract(month from p_period_start)::integer not in (1, 4, 7, 10)
       or p_period_end <> (p_period_start + interval '3 months - 1 day')::date
     ) then
    raise exception 'Automated quarterly Scorecard dates are not canonical.';
  end if;
  if p_period_kind = 'annual'
     and (
       extract(month from p_period_start)::integer <> 1
       or p_period_end <> (p_period_start + interval '1 year - 1 day')::date
     ) then
    raise exception 'Automated annual Scorecard dates are not canonical.';
  end if;
  if p_period_end >= (now() at time zone 'America/Chicago')::date then
    raise exception 'Automated Scorecards can only publish after the period is closed.';
  end if;
  if p_source_manifest->>'trigger' is distinct from 'gateway_complete'
     or p_source_manifest->>'generationScope' is distinct from 'population'
     or jsonb_typeof(decisions) is distinct from 'array' then
    raise exception 'Automated Scorecard publication requires complete eligibility provenance.';
  end if;
  if jsonb_typeof(p_producer_metrics) is distinct from 'array'
     or jsonb_typeof(p_builder_metrics) is distinct from 'array'
     or jsonb_typeof(p_snapshots) is distinct from 'array' then
    raise exception 'Automated Scorecard publication payloads must be JSON arrays.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('scorecard-auto:' || p_period_kind || ':' || p_period_start::text, 0)
  );

  select * into existing_run
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
      select count(*)::integer from scorecard_snapshot where metric_run_id = existing_run.id
    );
    existing := true;
    return next;
    return;
  end if;

  if exists (
    select 1 from scorecard_snapshot snapshot
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
  into frozen_producer_count, frozen_builder_count
  from scorecard_population_context(p_period_end);
  frozen_producer_count := coalesce(frozen_producer_count, 0);
  frozen_builder_count := coalesce(frozen_builder_count, 0);
  frozen_card_count := frozen_producer_count + frozen_builder_count;
  if frozen_card_count = 0 then
    raise exception 'Automated Scorecard publication has no frozen period-end population.';
  end if;

  decision_count := jsonb_array_length(decisions);
  if decision_count <> frozen_card_count then
    raise exception 'Automatic eligibility decisions do not cover the frozen population.';
  end if;
  if (
    select count(*) from (
      select decision->>'personId' person_id, decision->>'cardType' card_type
      from jsonb_array_elements(decisions) decision
      group by 1, 2
    ) unique_decisions
  ) <> frozen_card_count then
    raise exception 'Automatic eligibility decisions contain duplicate card identities.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(decisions) decision
    left join scorecard_population_context(p_period_end) context
      on context.person_id = nullif(decision->>'personId', '')::uuid
    where context.person_id is null
      or decision->>'cardType' not in ('producer', 'builder')
      or decision->>'status' not in ('eligible', 'excluded')
      or (decision->>'cardType' = 'producer' and (not context.active_at_period_end or not context.producer_at_period_end))
      or (decision->>'cardType' = 'builder' and (not context.active_at_period_end or not context.builder_at_period_end))
      or (decision->>'status' = 'excluded' and nullif(btrim(coalesce(decision->>'reason', '')), '') is null)
  ) then
    raise exception 'Automatic eligibility decisions contain an invalid frozen-population card.';
  end if;

  select
    count(*) filter (where decision->>'cardType' = 'producer' and decision->>'status' = 'eligible')::integer,
    count(*) filter (where decision->>'cardType' = 'builder' and decision->>'status' = 'eligible')::integer
  into producer_count, builder_count
  from jsonb_array_elements(decisions) decision;
  producer_count := coalesce(producer_count, 0);
  builder_count := coalesce(builder_count, 0);
  expected_count := producer_count + builder_count;
  if expected_count = 0 then
    raise exception 'Automated Scorecard publication has no eligible cards.';
  end if;

  supplied_producer_count := jsonb_array_length(p_producer_metrics);
  supplied_builder_count := jsonb_array_length(p_builder_metrics);
  supplied_snapshot_count := jsonb_array_length(p_snapshots);
  if supplied_producer_count <> producer_count
     or supplied_builder_count <> builder_count
     or supplied_snapshot_count <> expected_count then
    raise exception 'Automated Scorecard payload counts do not match the eligible subset.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_producer_metrics) supplied
    where coalesce(supplied->>'metricId', '') = ''
      or jsonb_typeof(supplied->'visiblePayload') is distinct from 'object'
      or not exists (
        select 1 from jsonb_array_elements(decisions) decision
        where decision->>'personId' = supplied->>'personId'
          and decision->>'cardType' = 'producer'
          and decision->>'status' = 'eligible'
      )
  ) or (
    select count(distinct supplied->>'personId') from jsonb_array_elements(p_producer_metrics) supplied
  ) <> producer_count then
    raise exception 'Automated Producer metric set does not match the eligible subset.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_builder_metrics) supplied
    where coalesce(supplied->>'metricId', '') = ''
      or jsonb_typeof(supplied->'visiblePayload') is distinct from 'object'
      or not exists (
        select 1 from jsonb_array_elements(decisions) decision
        where decision->>'personId' = supplied->>'personId'
          and decision->>'cardType' = 'builder'
          and decision->>'status' = 'eligible'
      )
  ) or (
    select count(distinct supplied->>'personId') from jsonb_array_elements(p_builder_metrics) supplied
  ) <> builder_count then
    raise exception 'Automated Builder metric set does not match the eligible subset.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_snapshots) snapshot
    where not exists (
      select 1 from jsonb_array_elements(decisions) decision
      where decision->>'personId' = snapshot->>'personId'
        and decision->>'cardType' = snapshot->>'cardType'
        and decision->>'status' = 'eligible'
    )
  ) then
    raise exception 'Automated snapshots contain an excluded card.';
  end if;

  insert into scorecard_metric_run (
    id, period_kind, period_start, period_end, period_label, revision, status,
    initiated_by, generation_scope, target_person_id, target_card_type, source_manifest
  ) values (
    p_run_id, p_period_kind, p_period_start, p_period_end, p_period_label, 1,
    'capturing', null, 'population', null, null, p_source_manifest
  );

  insert into person_role_status_fact (
    run_id, person_id, full_name, email, photo_url, upline_id,
    active_at_period_end, producer_at_period_end, builder_at_period_end
  )
  select
    p_run_id, context.person_id, context.full_name, context.email, context.photo_url,
    context.upline_id, context.active_at_period_end, context.producer_at_period_end,
    context.builder_at_period_end
  from scorecard_population_context(p_period_end) context;

  insert into producer_period_metric (
    id, run_id, person_id, visible_payload, source_coverage, source_fingerprint, validated_at
  )
  select
    (supplied->>'metricId')::uuid,
    p_run_id,
    (supplied->>'personId')::uuid,
    supplied->'visiblePayload',
    coalesce(supplied->'sourceCoverage', '{}'::jsonb),
    md5(coalesce(supplied->'visiblePayload', '{}'::jsonb)::text || '|' || coalesce(supplied->'sourceCoverage', '{}'::jsonb)::text),
    now()
  from jsonb_array_elements(p_producer_metrics) supplied;

  for metric in select value from jsonb_array_elements(p_builder_metrics)
  loop
    insert into builder_period_metric (
      id, run_id, person_id, visible_payload, team_ip_cents, team_rank,
      team_rank_population, team_rank_unavailable_reason, active_writers,
      active_writer_report_dates, first_leg_percent, average_monthly_ip_per_writer_cents,
      month_count, prior_team_ip_cents, growth_percent, growth_comparison,
      recruits_added, recruiting_rank, recruiting_rank_population, trend_buckets,
      source_coverage, source_fingerprint, validated_at
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
        select value::date from jsonb_array_elements_text(
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
      md5(coalesce(metric->'visiblePayload', '{}'::jsonb)::text || '|' || coalesce(metric->'sourceCoverage', '{}'::jsonb)::text),
      now()
    );
  end loop;

  if (select count(*) from producer_period_metric metric where metric.run_id = p_run_id and metric.validated_at is not null) <> producer_count
     or (select count(*) from builder_period_metric metric where metric.run_id = p_run_id and metric.validated_at is not null) <> builder_count then
    raise exception 'Automated validated metric rows do not match the eligible subset.';
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

  select count(*)::integer into published_snapshot_count
  from publish_scorecard_run(p_run_id, p_snapshots);

  if published_snapshot_count <> expected_count then
    raise exception 'Automated eligible publisher did not return every eligible Scorecard artifact.';
  end if;

  run_id := p_run_id;
  snapshot_count := published_snapshot_count;
  existing := false;
  return next;
end;
$$;

revoke all on function public.publish_gateway_eligible_scorecard_population(
  uuid, text, date, date, text, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.publish_gateway_eligible_scorecard_population(
  uuid, text, date, date, text, jsonb, jsonb, jsonb, jsonb
) to service_role;

notify pgrst, 'reload schema';
