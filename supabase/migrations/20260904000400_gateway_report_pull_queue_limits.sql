-- Ticket #007 queue hardening: bound global browser concurrency and stop jobs
-- from re-queuing forever when a runner repeatedly dies without reporting back.

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

  -- Server-side ceiling: even a burst of runner polls cannot open hundreds of
  -- browser sessions at once.
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

revoke all on function public.claim_gateway_report_pull_job(integer) from public, anon, authenticated;
grant execute on function public.claim_gateway_report_pull_job(integer) to service_role;

notify pgrst, 'reload schema';
