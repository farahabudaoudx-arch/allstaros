-- Ticket #007 final queue/import fencing.
--
-- 1) Serialize claim decisions so the global browser concurrency ceiling is
--    strict even when multiple runner pollers hit the endpoint simultaneously.
-- 2) Never run two browser jobs for the same person at once.
-- 3) Fence personal audit dates to the claimed job. Current WTD/MTD/YTD pulls
--    belong to that Chicago business date; first-connect history cannot write
--    future reports and pre-2026 history may only be recorded as skipped.

create unique index if not exists gateway_report_pull_job_one_running_person_idx
  on public.gateway_report_pull_job (person_id)
  where status = 'running';

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
  v_running integer := 0;
begin
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'invalid_gateway_pull_lease';
  end if;

  -- Serialize the cleanup/count/claim decision across pollers. The partial
  -- unique index above independently prevents same-person parallel jobs.
  perform pg_advisory_xact_lock(2107, 7);

  update public.gateway_report_pull_job as j
  set status = 'failed',
      finished_at = now(),
      lease_expires_at = null,
      last_error = coalesce(j.last_error, 'runner_lease_expired')
  where j.status = 'running'
    and j.lease_expires_at is not null
    and j.lease_expires_at <= now()
    and j.attempt_count >= 3;

  update public.gateway_report_pull_job as j
  set status = 'queued',
      available_at = now(),
      claimed_at = null,
      lease_expires_at = null,
      last_error = coalesce(j.last_error, 'runner_lease_expired')
  where j.status = 'running'
    and j.lease_expires_at is not null
    and j.lease_expires_at <= now()
    and j.attempt_count < 3;

  update public.gateway_report_pull_job as j
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
      last_error = null
  where j.id = v_job.id;

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

create or replace function public.enforce_gateway_personal_import_job_date()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_job public.gateway_report_pull_job%rowtype;
begin
  if new.pull_job_id is null then
    return new;
  end if;

  select * into v_job
  from public.gateway_report_pull_job
  where id = new.pull_job_id;

  if not found or new.person_id is distinct from v_job.person_id then
    raise exception 'gateway_personal_import_job_mismatch';
  end if;

  if new.session_generation is distinct from v_job.session_generation
     or new.pull_kind is distinct from v_job.pull_kind then
    raise exception 'gateway_personal_import_generation_mismatch';
  end if;

  if v_job.pull_kind in ('monday', 'reconnect')
     and new.report_date is distinct from v_job.business_date then
    raise exception 'gateway_current_report_date_mismatch';
  end if;

  if v_job.pull_kind = 'first_connect' then
    if new.report_date > v_job.business_date then
      raise exception 'gateway_first_connect_future_report';
    end if;
    if new.report_date < date '2026-01-01' and new.status <> 'skipped' then
      raise exception 'gateway_first_connect_before_2026_must_skip';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists gateway_personal_import_job_date on public.gateway_issued_premium_import;
create trigger gateway_personal_import_job_date
  before insert or update of person_id, pull_job_id, session_generation, pull_kind, report_date, status
  on public.gateway_issued_premium_import
  for each row execute function public.enforce_gateway_personal_import_job_date();

revoke all on function public.claim_gateway_report_pull_job(integer) from public, anon, authenticated;
grant execute on function public.claim_gateway_report_pull_job(integer) to service_role;

notify pgrst, 'reload schema';
