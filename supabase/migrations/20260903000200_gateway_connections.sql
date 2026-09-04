-- Ticket #005: per-person Gateway connection lifecycle.
--
-- This migration intentionally stores only an opaque session reference. It
-- never stores Gateway usernames, passwords, 2FA codes, cookies, or browser
-- session contents. The reference is meaningful only to the external hosted
-- Gateway runner, whose operational implementation lives outside this repo.

create table if not exists public.gateway_connection (
  person_id uuid primary key references public.person(id) on delete cascade,
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'needs_reconnect')),
  session_ref text,
  session_generation bigint not null default 0,
  first_connected_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_verified_at timestamptz,
  last_error text,
  prompt_dismissed_at timestamptz,
  initial_backfill_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gateway_connection_connected_session_check
    check (status <> 'connected' or session_ref is not null),
  constraint gateway_connection_first_connected_check
    check (first_connected_at is not null or initial_backfill_completed_at is null)
);

create index if not exists gateway_connection_status_updated_idx
  on public.gateway_connection (status, updated_at desc);

drop trigger if exists gateway_connection_updated_at on public.gateway_connection;
create trigger gateway_connection_updated_at
  before update on public.gateway_connection
  for each row execute function set_updated_at();

alter table public.gateway_connection enable row level security;
revoke all on public.gateway_connection from anon, authenticated;
grant all on public.gateway_connection to service_role;

create table if not exists public.gateway_connect_request (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person(id) on delete cascade,
  state_hash text not null unique,
  target_generation bigint not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'cancelled', 'expired')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gateway_connect_request_person_created_idx
  on public.gateway_connect_request (person_id, created_at desc);
create index if not exists gateway_connect_request_pending_expiry_idx
  on public.gateway_connect_request (expires_at)
  where status = 'pending';
create unique index if not exists gateway_connect_request_one_pending_person_idx
  on public.gateway_connect_request (person_id)
  where status = 'pending';

drop trigger if exists gateway_connect_request_updated_at on public.gateway_connect_request;
create trigger gateway_connect_request_updated_at
  before update on public.gateway_connect_request
  for each row execute function set_updated_at();

alter table public.gateway_connect_request enable row level security;
revoke all on public.gateway_connect_request from anon, authenticated;
grant all on public.gateway_connect_request to service_role;

-- Start a new hosted-login attempt without destroying a currently-good session.
-- Any prior pending attempt is cancelled first, so only the newest request can
-- ever complete. `target_generation` advances only when a connection replaces
-- the current session; starting the attempt itself does not invalidate it.
create or replace function public.begin_gateway_connection(
  p_person_id uuid,
  p_state_hash text,
  p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_generation bigint;
begin
  if p_person_id is null or nullif(btrim(p_state_hash), '') is null then
    raise exception 'invalid_gateway_connect_request';
  end if;
  if p_expires_at <= now() then
    raise exception 'invalid_gateway_connect_expiry';
  end if;

  if not exists (
    select 1 from public.person
    where id = p_person_id
      and status = 'active'
      and (is_producer or is_builder)
  ) then
    raise exception 'gateway_person_not_eligible';
  end if;

  insert into public.gateway_connection (person_id)
  values (p_person_id)
  on conflict (person_id) do nothing;

  perform 1 from public.gateway_connection where person_id = p_person_id for update;

  update public.gateway_connect_request
  set status = case when expires_at <= now() then 'expired' else 'cancelled' end,
      consumed_at = coalesce(consumed_at, now())
  where person_id = p_person_id and status = 'pending';

  select session_generation + 1 into v_generation
  from public.gateway_connection
  where person_id = p_person_id;

  insert into public.gateway_connect_request (
    person_id, state_hash, target_generation, expires_at
  ) values (
    p_person_id, p_state_hash, v_generation, p_expires_at
  ) returning id into v_request_id;

  return v_request_id;
end;
$$;

-- Complete only the exact newest still-pending request. A late callback after
-- Disconnect or after a newer connect attempt was started cannot resurrect an
-- old session because those actions cancel the request before this lock check.
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

  -- A newer request, an explicit disconnect, or a worker invalidation advances
  -- the generation or cancels this request. Never let an old callback win.
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

  return v_request.person_id;
end;
$$;

create or replace function public.fail_gateway_connection_request(
  p_state_hash text,
  p_error_code text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.gateway_connect_request%rowtype;
begin
  select * into v_request
  from public.gateway_connect_request
  where state_hash = p_state_hash
  for update;

  if not found then
    raise exception 'gateway_connect_request_not_found';
  end if;

  if v_request.status = 'pending' then
    update public.gateway_connect_request
    set status = case when expires_at <= now() then 'expired' else 'failed' end,
        consumed_at = now(),
        error_code = nullif(left(coalesce(p_error_code, ''), 120), '')
    where id = v_request.id;
  end if;

  return v_request.person_id;
end;
$$;

create or replace function public.disconnect_gateway_connection(
  p_person_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gateway_connection (person_id)
  values (p_person_id)
  on conflict (person_id) do nothing;

  perform 1 from public.gateway_connection where person_id = p_person_id for update;

  update public.gateway_connect_request
  set status = 'cancelled', consumed_at = coalesce(consumed_at, now())
  where person_id = p_person_id and status = 'pending';

  update public.gateway_connection
  set status = 'disconnected',
      session_ref = null,
      session_generation = session_generation + 1,
      connected_at = null,
      disconnected_at = case when first_connected_at is null then disconnected_at else now() end,
      last_verified_at = null,
      last_error = null,
      -- Do not reopen the first-open modal immediately after an intentional
      -- Disconnect. Ticket #006 owns later reminder cadence separately.
      prompt_dismissed_at = now()
  where person_id = p_person_id;
end;
$$;

create or replace function public.dismiss_gateway_connection_prompt(
  p_person_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gateway_connection (person_id, prompt_dismissed_at)
  values (p_person_id, now())
  on conflict (person_id) do update
    set prompt_dismissed_at = excluded.prompt_dismissed_at;
end;
$$;

-- Future worker boundary: only invalidate the exact session generation that was
-- actually checked. A stale worker result can never downgrade a fresh reconnect.
create or replace function public.mark_gateway_connection_needs_reconnect(
  p_person_id uuid,
  p_session_generation bigint,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  update public.gateway_connection
  set status = 'needs_reconnect',
      session_ref = null,
      session_generation = session_generation + 1,
      connected_at = null,
      disconnected_at = now(),
      last_verified_at = null,
      last_error = nullif(left(coalesce(p_error, ''), 500), '')
  where person_id = p_person_id
    and status = 'connected'
    and session_generation = p_session_generation;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.begin_gateway_connection(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_gateway_connection(text, text) from public, anon, authenticated;
revoke all on function public.fail_gateway_connection_request(text, text) from public, anon, authenticated;
revoke all on function public.disconnect_gateway_connection(uuid) from public, anon, authenticated;
revoke all on function public.dismiss_gateway_connection_prompt(uuid) from public, anon, authenticated;
revoke all on function public.mark_gateway_connection_needs_reconnect(uuid, bigint, text) from public, anon, authenticated;

grant execute on function public.begin_gateway_connection(uuid, text, timestamptz) to service_role;
grant execute on function public.complete_gateway_connection(text, text) to service_role;
grant execute on function public.fail_gateway_connection_request(text, text) to service_role;
grant execute on function public.disconnect_gateway_connection(uuid) to service_role;
grant execute on function public.dismiss_gateway_connection_prompt(uuid) to service_role;
grant execute on function public.mark_gateway_connection_needs_reconnect(uuid, bigint, text) to service_role;

notify pgrst, 'reload schema';
