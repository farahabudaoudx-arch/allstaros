-- Ticket #007: durable per-person Gateway report pull queue.
--
-- The browser runner is external to All Star OS. The app owns durable job state,
-- exact session-generation fencing, and scoped import metadata. The runner only
-- receives an opaque session_ref for a claimed job.

create table if not exists public.gateway_report_pull_job (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person(id) on delete cascade,
  session_generation bigint not null check (session_generation >= 0),
  pull_kind text not null check (pull_kind in ('first_connect', 'monday', 'reconnect')),
  business_date date not null,
  status text not null default 'queued' check (status in (
    'queued', 'running', 'succeeded', 'failed', 'cancelled', 'needs_reconnect'
  )),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  finished_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, pull_kind, session_generation, business_date)
);

create index if not exists gateway_report_pull_job_queue_idx
  on public.gateway_report_pull_job (status, available_at, created_at);

create index if not exists gateway_report_pull_job_person_idx
  on public.gateway_report_pull_job (person_id, created_at desc);

drop trigger if exists gateway_report_pull_job_updated_at on public.gateway_report_pull_job;
create trigger gateway_report_pull_job_updated_at
  before update on public.gateway_report_pull_job
  for each row execute function set_updated_at();

alter table public.gateway_report_pull_job enable row level security;
grant all on public.gateway_report_pull_job to service_role;

-- Link existing audit rows to their personal pull/job without creating a second
-- Issued Paid table. Legacy rows remain valid with null context columns.
alter table public.gateway_issued_premium_import
  add column if not exists person_id uuid references public.person(id) on delete set null,
  add column if not exists pull_job_id uuid references public.gateway_report_pull_job(id) on delete set null,
  add column if not exists session_generation bigint,
  add column if not exists pull_kind text check (pull_kind is null or pull_kind in ('first_connect', 'monday', 'reconnect'));

create index if not exists gateway_issued_premium_import_person_created_idx
  on public.gateway_issued_premium_import (person_id, created_at desc);

create index if not exists gateway_issued_premium_import_pull_job_idx
  on public.gateway_issued_premium_import (pull_job_id, created_at);

-- Enqueue exactly one job for the newly connected session. First connection (or
-- a reconnect while the initial backfill is still incomplete) runs the 2026+
-- backfill. Later reconnects pull only the current WTD/MTD/YTD reports.
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
    when v_connection.initial_backfill_completed_at is null then 'first_connect'
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

-- Replace #005 completion with the same race-safe lifecycle plus an atomic #007
-- enqueue. If enqueue fails, the entire connect completion rolls back instead of
-- leaving a connected person with no first-connect/reconnect pull job.
create or replace function public.complete_gateway_connection(
  p_state_hash text,
  p_session_ref text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.gateway_connect_request%rowtype;
  v_now timestamptz := now();
begin
  if nullif(btrim(p_state_hash), '') is null or nullif(btrim(p_session_ref), '') is null then
    raise exception 'invalid_gateway_connect_completion';
  end if;

  select * into v_request
  from public.gateway_connect_request
  where state_hash = p_state_hash
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception 'gateway_connect_request_not_pending';
  end if;
  if v_request.expires_at <= v_now then
    update public.gateway_connect_request
    set status = 'expired', consumed_at = coalesce(consumed_at, v_now)
    where id = v_request.id;
    raise exception 'gateway_connect_request_expired';
  end if;

  perform 1 from public.gateway_connection
  where person_id = v_request.person_id
  for update;

  if exists (
    select 1 from public.gateway_connect_request newer
    where newer.person_id = v_request.person_id
      and newer.status = 'pending'
      and newer.id <> v_request.id
      and newer.created_at > v_request.created_at
  ) then
    raise exception 'gateway_connect_request_superseded';
  end if;

  update public.gateway_connection
  set status = 'connected',
      session_ref = p_session_ref,
      session_generation = v_request.target_generation,
      first_connected_at = coalesce(first_connected_at, v_now),
      connected_at = v_now,
      disconnected_at = null,
      last_verified_at = v_now,
      last_error = null
  where person_id = v_request.person_id;

  update public.gateway_connect_request
  set status = 'completed', consumed_at = v_now
  where id = v_request.id;

  perform public.enqueue_gateway_report_pull_after_connect(v_request.person_id);
  return v_request.person_id;
end;
$$;

-- Monday minting is idempotent and Chicago-date based. Running this RPC every
-- hour/day is safe; it inserts nothing unless p_business_date is a Monday.
create or replace function public.mint_gateway_monday_report_pull_jobs(
  p_business_date date
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  if p_business_date is null or extract(isodow from p_business_date) <> 1 then
    return 0;
  end if;

  insert into public.gateway_report_pull_job (
    person_id, session_generation, pull_kind, business_date
  )
  select c.person_id, c.session_generation, 'monday', p_business_date
  from public.gateway_connection c
  join public.person p on p.id = c.person_id
  where c.status = 'connected'
    and nullif(btrim(coalesce(c.session_ref, '')), '') is not null
    and p.status = 'active'
    and (p.is_producer or p.is_builder)
  on conflict (person_id, pull_kind, session_generation, business_date) do nothing;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Claim one job at a time. Expired leases are re-queued, stale-generation jobs
-- are cancelled, and SKIP LOCKED makes multiple runner pollers safe without
-- opening every person's browser at once.
create or replace function public.claim_gateway_report_pull_job(
  p_lease_seconds integer default 1200
) returns table (
  id uuid,
  person_id uuid,
  pull_kind text,
  business_date date,
  session_generation bigint,
  session_ref text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.gateway_report_pull_job%rowtype;
begin
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'invalid_gateway_pull_lease';
  end if;

  update public.gateway_report_pull_job j
  set status = 'queued',
      available_at = now(),
      claimed_at = null,
      lease_expires_at = null,
      last_error = coalesce(j.last_error, 'runner_lease_expired')
  where j.status = 'running'
    and j.lease_expires_at is not null
    and j.lease_expires_at <= now();

  update public.gateway_report_pull_job j
  set status = 'cancelled',
      finished_at = coalesce(j.finished_at, now()),
      last_error = coalesce(j.last_error, 'stale_or_disconnected_session')
  where j.status in ('queued', 'running')
    and not exists (
      select 1 from public.gateway_connection c
      where c.person_id = j.person_id
        and c.status = 'connected'
        and c.session_generation = j.session_generation
        and nullif(btrim(coalesce(c.session_ref, '')), '') is not null
    );

  select j.* into v_job
  from public.gateway_report_pull_job j
  join public.gateway_connection c
    on c.person_id = j.person_id
   and c.status = 'connected'
   and c.session_generation = j.session_generation
   and nullif(btrim(coalesce(c.session_ref, '')), '') is not null
  where j.status = 'queued'
    and j.available_at <= now()
  order by j.created_at asc, j.id asc
  for update of j skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.gateway_report_pull_job
  set status = 'running',
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      last_error = null
  where gateway_report_pull_job.id = v_job.id;

  return query
  select j.id,
         j.person_id,
         j.pull_kind,
         j.business_date,
         j.session_generation,
         c.session_ref,
         j.attempt_count
  from public.gateway_report_pull_job j
  join public.gateway_connection c on c.person_id = j.person_id
  where j.id = v_job.id;
end;
$$;

create or replace function public.complete_gateway_report_pull_job(
  p_job_id uuid,
  p_session_generation bigint,
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

  if not found or v_job.status <> 'running' or v_job.session_generation <> p_session_generation then
    return false;
  end if;

  if v_job.pull_kind in ('monday', 'reconnect') and exists (
    select 1
    from (values ('wtd'), ('mtd'), ('ytd')) required(period_type)
    where not exists (
      select 1
      from public.gateway_issued_premium_import i
      where i.pull_job_id = v_job.id
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
    set status = 'cancelled', finished_at = now(), last_error = 'stale_completion'
    where id = p_job_id;
    return false;
  end if;

  update public.gateway_report_pull_job
  set status = 'succeeded',
      finished_at = now(),
      lease_expires_at = null,
      summary = coalesce(p_summary, '{}'::jsonb),
      last_error = null
  where id = p_job_id;
  return true;
end;
$$;

-- Commit one parsed personal Gateway report atomically behind the exact claimed
-- session generation. p_row is either null (no row in the file matched the
-- connected person) or the one parsed row that matched that person's NPN. The
-- caller never supplies person_id for the upsert; the job owns that identity.
create or replace function public.import_gateway_personal_issued_premium(
  p_job_id uuid,
  p_session_generation bigint,
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
  p_skip_reason text default null
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
  v_matched_count integer := case when p_row is null then 0 else 1 end;
begin
  if p_period_type not in ('wtd', 'mtd', 'ytd') then
    raise exception 'invalid_gateway_report_period';
  end if;
  if p_rows_seen < 0 or p_unmatched_count < 0 or p_ambiguous_count < 0 then
    raise exception 'invalid_gateway_report_counts';
  end if;

  select * into v_job
  from public.gateway_report_pull_job
  where id = p_job_id
  for update;

  if not found
     or v_job.status <> 'running'
     or v_job.session_generation <> p_session_generation then
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

  if nullif(btrim(coalesce(p_skip_reason, '')), '') is not null then
    insert into public.gateway_issued_premium_import (
      person_id, pull_job_id, session_generation, pull_kind,
      period_type, status, report_date, period_start, gateway_label,
      source_file_name, source_checksum, rows_seen, matched_count,
      unmatched_count, ambiguous_count, skipped_count, summary, finished_at
    ) values (
      v_job.person_id, v_job.id, p_session_generation, v_job.pull_kind,
      p_period_type, 'skipped', p_report_date, p_period_start, p_gateway_label,
      p_source_file_name, p_source_checksum, p_rows_seen, 0,
      p_unmatched_count, p_ambiguous_count, p_rows_seen,
      coalesce(p_summary, '{}'::jsonb) || jsonb_build_object('reason', left(p_skip_reason, 200)),
      now()
    ) returning id into v_import_id;

    return jsonb_build_object('status', 'skipped', 'importId', v_import_id);
  end if;

  select i.id into v_existing_id
  from public.gateway_issued_premium_import i
  where i.person_id = v_job.person_id
    and i.period_type = p_period_type
    and i.report_date = p_report_date
    and i.source_checksum = p_source_checksum
    and i.status = 'imported'
  order by i.created_at desc
  limit 1;

  if v_existing_id is not null then
    insert into public.gateway_issued_premium_import (
      person_id, pull_job_id, session_generation, pull_kind,
      period_type, status, report_date, period_start, gateway_label,
      source_file_name, source_checksum, rows_seen, matched_count,
      unmatched_count, ambiguous_count, skipped_count, summary, finished_at
    ) values (
      v_job.person_id, v_job.id, p_session_generation, v_job.pull_kind,
      p_period_type, 'no_new_report', p_report_date, p_period_start, p_gateway_label,
      p_source_file_name, p_source_checksum, p_rows_seen, 0,
      p_unmatched_count, p_ambiguous_count, p_rows_seen,
      coalesce(p_summary, '{}'::jsonb) || jsonb_build_object(
        'reason', 'same_report_checksum_already_imported',
        'existingImportId', v_existing_id
      ),
      now()
    ) returning id into v_import_id;

    return jsonb_build_object('status', 'no_new_report', 'importId', v_import_id);
  end if;

  insert into public.gateway_issued_premium_import (
    person_id, pull_job_id, session_generation, pull_kind,
    period_type, status, report_date, period_start, gateway_label,
    source_file_name, source_checksum, rows_seen, matched_count,
    unmatched_count, ambiguous_count, skipped_count, summary
  ) values (
    v_job.person_id, v_job.id, p_session_generation, v_job.pull_kind,
    p_period_type, 'pending', p_report_date, p_period_start, p_gateway_label,
    p_source_file_name, p_source_checksum, p_rows_seen, v_matched_count,
    p_unmatched_count, p_ambiguous_count,
    greatest(0, p_rows_seen - v_matched_count), coalesce(p_summary, '{}'::jsonb)
  ) returning id into v_import_id;

  if p_row is not null then
    insert into public.producer_issued_premium (
      person_id, import_id, period_type, report_date, period_start, gateway_label,
      gateway_producer, gateway_npn, gateway_email, gateway_upline,
      gateway_upline_npn, gateway_agency, personal_ip_cents, team_ip_cents,
      first_leg_producer, first_leg_npn, first_leg_percent, outside_first_leg_cents
    ) values (
      v_job.person_id,
      v_import_id,
      p_period_type,
      p_report_date,
      p_period_start,
      p_gateway_label,
      nullif(p_row->>'producer', ''),
      nullif(p_row->>'producerNpn', ''),
      nullif(p_row->>'email', ''),
      nullif(p_row->>'upline', ''),
      nullif(p_row->>'uplineNpn', ''),
      nullif(p_row->>'agency', ''),
      coalesce((p_row->>'personalIpCents')::bigint, 0),
      coalesce((p_row->>'teamIpCents')::bigint, 0),
      nullif(p_row->>'firstLegProducer', ''),
      nullif(p_row->>'firstLegNpn', ''),
      case
        when nullif(p_row->>'firstLegPercent', '') is null then null
        else (p_row->>'firstLegPercent')::numeric
      end,
      coalesce((p_row->>'outsideFirstLegCents')::bigint, 0)
    )
    on conflict (person_id, period_type, report_date) do update
    set import_id = excluded.import_id,
        period_start = excluded.period_start,
        gateway_label = excluded.gateway_label,
        gateway_producer = excluded.gateway_producer,
        gateway_npn = excluded.gateway_npn,
        gateway_email = excluded.gateway_email,
        gateway_upline = excluded.gateway_upline,
        gateway_upline_npn = excluded.gateway_upline_npn,
        gateway_agency = excluded.gateway_agency,
        personal_ip_cents = excluded.personal_ip_cents,
        team_ip_cents = excluded.team_ip_cents,
        first_leg_producer = excluded.first_leg_producer,
        first_leg_npn = excluded.first_leg_npn,
        first_leg_percent = excluded.first_leg_percent,
        outside_first_leg_cents = excluded.outside_first_leg_cents;

    update public.person
    set npn_status = 'verified',
        npn_source = 'gateway_csv',
        npn_verified_at = now()
    where id = v_job.person_id
      and npn_status = 'submitted';
  end if;

  update public.gateway_issued_premium_import
  set status = 'imported', finished_at = now()
  where id = v_import_id;

  return jsonb_build_object('status', 'imported', 'importId', v_import_id);
end;
$$;

create or replace function public.fail_gateway_report_pull_job(
  p_job_id uuid,
  p_session_generation bigint,
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

  if not found or v_job.status <> 'running' or v_job.session_generation <> p_session_generation then
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
        lease_expires_at = null,
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
        last_error = v_error
    where id = p_job_id;
    return 'queued';
  end if;

  update public.gateway_report_pull_job
  set status = 'failed',
      finished_at = now(),
      lease_expires_at = null,
      last_error = v_error
  where id = p_job_id;
  return 'failed';
end;
$$;

revoke all on function public.enqueue_gateway_report_pull_after_connect(uuid) from public, anon, authenticated;
revoke all on function public.mint_gateway_monday_report_pull_jobs(date) from public, anon, authenticated;
revoke all on function public.claim_gateway_report_pull_job(integer) from public, anon, authenticated;
revoke all on function public.complete_gateway_report_pull_job(uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.import_gateway_personal_issued_premium(uuid, bigint, text, date, date, text, text, text, integer, integer, integer, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.fail_gateway_report_pull_job(uuid, bigint, text, boolean, boolean) from public, anon, authenticated;

grant execute on function public.enqueue_gateway_report_pull_after_connect(uuid) to service_role;
grant execute on function public.mint_gateway_monday_report_pull_jobs(date) to service_role;
grant execute on function public.claim_gateway_report_pull_job(integer) to service_role;
grant execute on function public.complete_gateway_report_pull_job(uuid, bigint, jsonb) to service_role;
grant execute on function public.import_gateway_personal_issued_premium(uuid, bigint, text, date, date, text, text, text, integer, integer, integer, jsonb, jsonb, text) to service_role;
grant execute on function public.fail_gateway_report_pull_job(uuid, bigint, text, boolean, boolean) to service_role;

-- complete_gateway_connection was replaced above; preserve its #005 privilege boundary.
revoke all on function public.complete_gateway_connection(text, text) from public, anon, authenticated;
grant execute on function public.complete_gateway_connection(text, text) to service_role;

notify pgrst, 'reload schema';
