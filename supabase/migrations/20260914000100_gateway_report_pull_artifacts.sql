-- Per-person immutable raw Gateway workbook evidence for the existing pull queue.
--
-- Evidence belongs to one claimed gateway_report_pull_job. The caller never
-- supplies person_id: every RPC derives it from the fenced job claim. Business
-- imports continue to use source_kind = 'personal_gateway'.

-- A claim POST can commit in Postgres while the HTTP response is lost. Persist a
-- caller-generated request UUID so retrying that POST replays the same live
-- claim instead of consuming another queued person's job. The ledger retains
-- old request identities across later attempts on the same job.
alter table public.gateway_report_pull_job
  add column if not exists claim_request_id uuid;

create table if not exists public.gateway_report_pull_claim_request (
  request_id uuid primary key,
  pull_job_id uuid not null references public.gateway_report_pull_job(id) on delete restrict,
  session_generation bigint not null check (session_generation >= 0),
  claim_token uuid not null,
  claimed_at timestamptz not null,
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists gateway_report_pull_claim_request_job_idx
  on public.gateway_report_pull_claim_request (pull_job_id, created_at desc);

alter table public.gateway_report_pull_claim_request enable row level security;
revoke all on public.gateway_report_pull_claim_request from public, anon, authenticated, service_role;
grant select on public.gateway_report_pull_claim_request to service_role;

create or replace function public.protect_gateway_report_pull_claim_request()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'gateway_report_pull_claim_request_immutable';
end;
$$;

drop trigger if exists gateway_report_pull_claim_request_immutable
  on public.gateway_report_pull_claim_request;
create trigger gateway_report_pull_claim_request_immutable
  before update or delete on public.gateway_report_pull_claim_request
  for each row execute function public.protect_gateway_report_pull_claim_request();

drop function if exists public.claim_gateway_report_pull_job(integer);

create function public.claim_gateway_report_pull_job(
  p_claim_request_id uuid,
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
  if p_claim_request_id is null then
    raise exception 'invalid_gateway_pull_claim_request';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'invalid_gateway_pull_lease';
  end if;

  perform pg_advisory_xact_lock(2107, 7);

  -- A request UUID is single-use forever. If this is a retry of a committed
  -- claim, replay only while that exact claim is still authoritative. If the
  -- attempt has already expired/completed, return no job; never map this request
  -- UUID to another acquisition.
  if exists (
    select 1
    from public.gateway_report_pull_claim_request request
    where request.request_id = p_claim_request_id
  ) then
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
    from public.gateway_report_pull_claim_request request
    join public.gateway_report_pull_job j
      on j.id = request.pull_job_id
     and j.session_generation = request.session_generation
     and j.claim_token = request.claim_token
     and j.claim_request_id = request.request_id
     and j.status = 'running'
     and j.lease_expires_at > now()
    join public.gateway_connection c
      on c.person_id = j.person_id
     and c.status = 'connected'
     and c.session_generation = j.session_generation
     and nullif(btrim(coalesce(c.session_ref, '')), '') is not null
    where request.request_id = p_claim_request_id;
    return;
  end if;

  update public.gateway_report_pull_job as j
  set status = 'failed',
      finished_at = now(),
      claimed_at = null,
      lease_expires_at = null,
      claim_token = null,
      claim_request_id = null,
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
      claim_request_id = null,
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
      claim_request_id = null,
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
      claim_request_id = p_claim_request_id,
      last_error = null
  where j.id = v_job.id;

  insert into public.gateway_report_pull_claim_request (
    request_id,
    pull_job_id,
    session_generation,
    claim_token,
    claimed_at,
    lease_expires_at
  )
  select
    p_claim_request_id,
    j.id,
    j.session_generation,
    j.claim_token,
    j.claimed_at,
    j.lease_expires_at
  from public.gateway_report_pull_job j
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

revoke all on function public.protect_gateway_report_pull_claim_request() from public, anon, authenticated, service_role;
revoke all on function public.claim_gateway_report_pull_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_gateway_report_pull_job(uuid, integer) to service_role;

create table if not exists public.gateway_report_pull_artifact (
  id uuid primary key default gen_random_uuid(),
  pull_job_id uuid not null references public.gateway_report_pull_job(id) on delete restrict,
  person_id uuid not null references public.person(id) on delete restrict,
  session_generation bigint not null check (session_generation >= 0),
  claim_token uuid not null,
  period_type text not null check (period_type in ('wtd', 'mtd', 'ytd')),
  source_kind text not null default 'personal_gateway'
    check (source_kind = 'personal_gateway'),
  provider_type text not null check (provider_type in ('http', 'browser')),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_file_name text not null check (
    char_length(source_file_name) between 1 and 255
  ),
  source_byte_count bigint not null check (
    source_byte_count > 0 and source_byte_count <= 26214400
  ),
  content_type text not null check (content_type in (
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  )),
  file_date date not null,
  rows_seen integer not null check (rows_seen > 0),
  unique_npn_count integer not null check (
    unique_npn_count >= 0 and unique_npn_count <= rows_seen
  ),
  duplicate_npn_values integer not null check (
    duplicate_npn_values >= 0 and duplicate_npn_values <= rows_seen
  ),
  report_date date not null,
  gateway_report_date date not null,
  scorecard_period_start date not null,
  scorecard_period_end date not null,
  gateway_week_start date,
  gateway_week_ordinal integer,
  gateway_period_final boolean,
  storage_path text,
  storage_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pull_job_id, claim_token, period_type, gateway_report_date),
  check (scorecard_period_start <= scorecard_period_end),
  check (report_date >= file_date),
  check (gateway_report_date between scorecard_period_start and scorecard_period_end),
  check (gateway_report_date <= report_date),
  check (
    (
      period_type = 'wtd'
      and gateway_week_start is not null
      and file_date = gateway_week_start
      and gateway_week_start <= gateway_report_date
      and (gateway_report_date - gateway_week_start) between 0 and 6
      and gateway_week_ordinal between 1 and 8
      and gateway_period_final is not null
    )
    or
    (
      period_type in ('mtd', 'ytd')
      and file_date between scorecard_period_start and scorecard_period_end
      and gateway_week_start is null
      and gateway_week_ordinal is null
      and gateway_period_final is null
    )
  ),
  check (
    (storage_path is null and storage_verified_at is null)
    or
    (storage_path is not null and storage_verified_at is not null)
  )
);

create index if not exists gateway_report_pull_artifact_person_created_idx
  on public.gateway_report_pull_artifact (person_id, created_at desc);

alter table public.gateway_report_pull_artifact enable row level security;
revoke all on public.gateway_report_pull_artifact from public, anon, authenticated, service_role;
grant select on public.gateway_report_pull_artifact to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gateway-report-evidence',
  'gateway-report-evidence',
  false,
  26214400,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.protect_gateway_report_pull_artifact()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'gateway_report_pull_artifact_delete_forbidden';
  end if;

  if new.pull_job_id is distinct from old.pull_job_id
     or new.person_id is distinct from old.person_id
     or new.session_generation is distinct from old.session_generation
     or new.claim_token is distinct from old.claim_token
     or new.period_type is distinct from old.period_type
     or new.source_kind is distinct from old.source_kind
     or new.provider_type is distinct from old.provider_type
     or new.source_sha256 is distinct from old.source_sha256
     or new.source_file_name is distinct from old.source_file_name
     or new.source_byte_count is distinct from old.source_byte_count
     or new.content_type is distinct from old.content_type
     or new.file_date is distinct from old.file_date
     or new.rows_seen is distinct from old.rows_seen
     or new.unique_npn_count is distinct from old.unique_npn_count
     or new.duplicate_npn_values is distinct from old.duplicate_npn_values
     or new.report_date is distinct from old.report_date
     or new.gateway_report_date is distinct from old.gateway_report_date
     or new.scorecard_period_start is distinct from old.scorecard_period_start
     or new.scorecard_period_end is distinct from old.scorecard_period_end
     or new.gateway_week_start is distinct from old.gateway_week_start
     or new.gateway_week_ordinal is distinct from old.gateway_week_ordinal
     or new.gateway_period_final is distinct from old.gateway_period_final
     or new.created_at is distinct from old.created_at then
    raise exception 'gateway_report_pull_artifact_immutable';
  end if;

  if old.storage_path is not null
     and new.storage_path is distinct from old.storage_path then
    raise exception 'gateway_report_pull_artifact_storage_immutable';
  end if;

  if old.storage_verified_at is not null
     and new.storage_verified_at is distinct from old.storage_verified_at then
    raise exception 'gateway_report_pull_artifact_storage_immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists gateway_report_pull_artifact_immutable
  on public.gateway_report_pull_artifact;
create trigger gateway_report_pull_artifact_immutable
  before update or delete on public.gateway_report_pull_artifact
  for each row execute function public.protect_gateway_report_pull_artifact();

create or replace function public.register_gateway_report_pull_artifact(
  p_job_id uuid,
  p_session_generation bigint,
  p_claim_token uuid,
  p_period_type text,
  p_provider_type text,
  p_source_sha256 text,
  p_source_file_name text,
  p_source_byte_count bigint,
  p_content_type text,
  p_file_date date,
  p_rows_seen integer,
  p_unique_npn_count integer,
  p_duplicate_npn_values integer,
  p_report_date date,
  p_gateway_report_date date,
  p_scorecard_period_start date,
  p_scorecard_period_end date,
  p_gateway_week_start date,
  p_gateway_week_ordinal integer,
  p_gateway_period_final boolean
) returns table (
  artifact_id uuid,
  existing boolean,
  period_type text,
  provider_type text,
  source_sha256 text,
  source_byte_count bigint,
  content_type text,
  storage_verified boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.gateway_report_pull_job%rowtype;
  v_existing public.gateway_report_pull_artifact%rowtype;
  v_sha256 text := lower(btrim(coalesce(p_source_sha256, '')));
  v_file_name text := btrim(coalesce(p_source_file_name, ''));
  v_content_type text := lower(btrim(coalesce(p_content_type, '')));
  v_provider text := lower(btrim(coalesce(p_provider_type, '')));
begin
  if p_period_type not in ('wtd', 'mtd', 'ytd')
     or v_provider not in ('http', 'browser')
     or v_sha256 !~ '^[0-9a-f]{64}$'
     or char_length(v_file_name) not between 1 and 255
     or p_source_byte_count is null
     or p_source_byte_count <= 0
     or p_source_byte_count > 26214400
     or v_content_type not in (
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/octet-stream'
     )
     or p_file_date is null
     or p_rows_seen is null or p_rows_seen <= 0
     or p_unique_npn_count is null or p_unique_npn_count < 0 or p_unique_npn_count > p_rows_seen
     or p_duplicate_npn_values is null or p_duplicate_npn_values < 0 or p_duplicate_npn_values > p_rows_seen
     or p_report_date is null
     or p_gateway_report_date is null
     or p_scorecard_period_start is null
     or p_scorecard_period_end is null
     or p_scorecard_period_start > p_scorecard_period_end
     or p_report_date < p_file_date
     or p_gateway_report_date < p_scorecard_period_start
     or p_gateway_report_date > p_scorecard_period_end
     or p_gateway_report_date > p_report_date
     or (
       p_period_type = 'wtd'
       and (
         p_gateway_week_start is null
         or p_file_date is distinct from p_gateway_week_start
         or p_gateway_week_start > p_gateway_report_date
         or (p_gateway_report_date - p_gateway_week_start) not between 0 and 6
         or p_gateway_week_ordinal is null
         or p_gateway_week_ordinal < 1
         or p_gateway_week_ordinal > 8
         or p_gateway_period_final is null
       )
     )
     or (
       p_period_type in ('mtd', 'ytd')
       and (
         p_file_date < p_scorecard_period_start
         or p_file_date > p_scorecard_period_end
         or
         p_gateway_week_start is not null
         or p_gateway_week_ordinal is not null
         or p_gateway_period_final is not null
       )
     ) then
    raise exception 'invalid_gateway_report_pull_artifact';
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
     or v_job.lease_expires_at <= now()
     or not exists (
       select 1
       from public.gateway_connection c
       where c.person_id = v_job.person_id
         and c.status = 'connected'
         and c.session_generation = v_job.session_generation
         and nullif(btrim(coalesce(c.session_ref, '')), '') is not null
     ) then
    raise exception 'stale_gateway_report_pull_claim';
  end if;

  if p_report_date > v_job.business_date
     or (
       v_job.pull_kind in ('monday', 'reconnect')
       and p_report_date is distinct from v_job.business_date
     ) then
    raise exception 'invalid_gateway_report_pull_artifact';
  end if;

  select * into v_existing
  from public.gateway_report_pull_artifact a
  where a.pull_job_id = v_job.id
    and a.claim_token = p_claim_token
    and a.period_type = p_period_type
    and a.gateway_report_date = p_gateway_report_date
  for update;

  if found then
    if v_existing.person_id is not distinct from v_job.person_id
       and v_existing.session_generation is not distinct from v_job.session_generation
       and v_existing.claim_token is not distinct from p_claim_token
       and v_existing.source_kind = 'personal_gateway'
       and v_existing.provider_type = v_provider
       and v_existing.source_sha256 = v_sha256
       and v_existing.source_file_name = v_file_name
       and v_existing.source_byte_count = p_source_byte_count
       and v_existing.content_type = v_content_type
       and v_existing.file_date is not distinct from p_file_date
       and v_existing.rows_seen is not distinct from p_rows_seen
       and v_existing.unique_npn_count is not distinct from p_unique_npn_count
       and v_existing.duplicate_npn_values is not distinct from p_duplicate_npn_values
       and v_existing.report_date is not distinct from p_report_date
       and v_existing.gateway_report_date is not distinct from p_gateway_report_date
       and v_existing.scorecard_period_start is not distinct from p_scorecard_period_start
       and v_existing.scorecard_period_end is not distinct from p_scorecard_period_end
       and v_existing.gateway_week_start is not distinct from p_gateway_week_start
       and v_existing.gateway_week_ordinal is not distinct from p_gateway_week_ordinal
       and v_existing.gateway_period_final is not distinct from p_gateway_period_final then
      artifact_id := v_existing.id;
      existing := true;
      period_type := v_existing.period_type;
      provider_type := v_existing.provider_type;
      source_sha256 := v_existing.source_sha256;
      source_byte_count := v_existing.source_byte_count;
      content_type := v_existing.content_type;
      storage_verified := v_existing.storage_verified_at is not null;
      return next;
      return;
    end if;

    raise exception 'gateway_report_pull_artifact_conflict';
  end if;

  insert into public.gateway_report_pull_artifact (
    pull_job_id,
    person_id,
    session_generation,
    claim_token,
    period_type,
    source_kind,
    provider_type,
    source_sha256,
    source_file_name,
    source_byte_count,
    content_type,
    file_date,
    rows_seen,
    unique_npn_count,
    duplicate_npn_values,
    report_date,
    gateway_report_date,
    scorecard_period_start,
    scorecard_period_end,
    gateway_week_start,
    gateway_week_ordinal,
    gateway_period_final
  ) values (
    v_job.id,
    v_job.person_id,
    v_job.session_generation,
    p_claim_token,
    p_period_type,
    'personal_gateway',
    v_provider,
    v_sha256,
    v_file_name,
    p_source_byte_count,
    v_content_type,
    p_file_date,
    p_rows_seen,
    p_unique_npn_count,
    p_duplicate_npn_values,
    p_report_date,
    p_gateway_report_date,
    p_scorecard_period_start,
    p_scorecard_period_end,
    p_gateway_week_start,
    p_gateway_week_ordinal,
    p_gateway_period_final
  )
  returning id into artifact_id;

  existing := false;
  period_type := p_period_type;
  provider_type := v_provider;
  source_sha256 := v_sha256;
  source_byte_count := p_source_byte_count;
  content_type := v_content_type;
  storage_verified := false;
  return next;
end;
$$;

create or replace function public.authorize_gateway_report_pull_artifact_upload(
  p_job_id uuid,
  p_session_generation bigint,
  p_claim_token uuid,
  p_artifact_id uuid
) returns table (
  artifact_id uuid,
  staging_path text,
  storage_path text,
  source_sha256 text,
  source_byte_count bigint,
  content_type text,
  already_verified boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.gateway_report_pull_job%rowtype;
  v_artifact public.gateway_report_pull_artifact%rowtype;
  v_storage_path text;
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
     or v_job.lease_expires_at <= now()
     or not exists (
       select 1
       from public.gateway_connection c
       where c.person_id = v_job.person_id
         and c.status = 'connected'
         and c.session_generation = v_job.session_generation
         and nullif(btrim(coalesce(c.session_ref, '')), '') is not null
     ) then
    raise exception 'stale_gateway_report_pull_claim';
  end if;

  select * into v_artifact
  from public.gateway_report_pull_artifact a
  where a.id = p_artifact_id
    and a.pull_job_id = v_job.id
    and a.person_id = v_job.person_id
    and a.session_generation = v_job.session_generation
    and a.claim_token = p_claim_token
    and a.source_kind = 'personal_gateway'
  for update;

  if not found then
    raise exception 'gateway_report_pull_artifact_not_found';
  end if;

  v_storage_path := format(
    'personal_gateway/%s/%s/%s/%s/%s/%s.xlsx',
    v_job.person_id,
    v_job.id,
    v_job.session_generation,
    v_artifact.id,
    v_artifact.period_type,
    v_artifact.source_sha256
  );

  if v_artifact.storage_verified_at is not null
     and v_artifact.storage_path is distinct from v_storage_path then
    raise exception 'gateway_report_pull_artifact_storage_conflict';
  end if;

  artifact_id := v_artifact.id;
  staging_path := format('staging/%s.xlsx', v_artifact.id);
  storage_path := v_storage_path;
  source_sha256 := v_artifact.source_sha256;
  source_byte_count := v_artifact.source_byte_count;
  content_type := v_artifact.content_type;
  already_verified := v_artifact.storage_verified_at is not null;
  return next;
end;
$$;

create or replace function public.confirm_gateway_report_pull_artifact_upload(
  p_job_id uuid,
  p_session_generation bigint,
  p_claim_token uuid,
  p_artifact_id uuid,
  p_observed_sha256 text,
  p_observed_byte_count bigint
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.gateway_report_pull_job%rowtype;
  v_artifact public.gateway_report_pull_artifact%rowtype;
  v_storage_path text;
  v_observed_sha256 text := lower(btrim(coalesce(p_observed_sha256, '')));
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
     or v_job.lease_expires_at <= now()
     or not exists (
       select 1
       from public.gateway_connection c
       where c.person_id = v_job.person_id
         and c.status = 'connected'
         and c.session_generation = v_job.session_generation
         and nullif(btrim(coalesce(c.session_ref, '')), '') is not null
     ) then
    raise exception 'stale_gateway_report_pull_claim';
  end if;

  select * into v_artifact
  from public.gateway_report_pull_artifact a
  where a.id = p_artifact_id
    and a.pull_job_id = v_job.id
    and a.person_id = v_job.person_id
    and a.session_generation = v_job.session_generation
    and a.claim_token = p_claim_token
    and a.source_kind = 'personal_gateway'
  for update;

  if not found then
    raise exception 'gateway_report_pull_artifact_not_found';
  end if;

  v_storage_path := format(
    'personal_gateway/%s/%s/%s/%s/%s/%s.xlsx',
    v_job.person_id,
    v_job.id,
    v_job.session_generation,
    v_artifact.id,
    v_artifact.period_type,
    v_artifact.source_sha256
  );

  if v_artifact.storage_verified_at is not null then
    if v_artifact.storage_path is distinct from v_storage_path then
      raise exception 'gateway_report_pull_artifact_storage_conflict';
    end if;
    return true;
  end if;

  if v_observed_sha256 <> v_artifact.source_sha256
     or p_observed_byte_count is distinct from v_artifact.source_byte_count then
    raise exception 'gateway_report_pull_artifact_storage_mismatch';
  end if;

  update public.gateway_report_pull_artifact
  set storage_path = v_storage_path,
      storage_verified_at = now()
  where id = v_artifact.id;

  return true;
end;
$$;

revoke all on function public.protect_gateway_report_pull_artifact() from public, anon, authenticated, service_role;
revoke all on function public.register_gateway_report_pull_artifact(uuid, bigint, uuid, text, text, text, text, bigint, text, date, integer, integer, integer, date, date, date, date, date, integer, boolean) from public, anon, authenticated;
revoke all on function public.authorize_gateway_report_pull_artifact_upload(uuid, bigint, uuid, uuid) from public, anon, authenticated;
revoke all on function public.confirm_gateway_report_pull_artifact_upload(uuid, bigint, uuid, uuid, text, bigint) from public, anon, authenticated;

grant execute on function public.register_gateway_report_pull_artifact(uuid, bigint, uuid, text, text, text, text, bigint, text, date, integer, integer, integer, date, date, date, date, date, integer, boolean) to service_role;
grant execute on function public.authorize_gateway_report_pull_artifact_upload(uuid, bigint, uuid, uuid) to service_role;
grant execute on function public.confirm_gateway_report_pull_artifact_upload(uuid, bigint, uuid, uuid, text, bigint) to service_role;

notify pgrst, 'reload schema';
