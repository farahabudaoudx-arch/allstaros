-- Whitelabel OS Assembly Line: Ticket 6 updates + independent operation.
--
-- CONTROL-PLANE ONLY. This migration records lifecycle/update orchestration in
-- the Assembly Line database. It must never enter the clean customer migration
-- manifest. Customer installations continue running from their own Vercel and
-- Supabase projects when this control plane is unavailable.

-- ---------------------------------------------------------------------------
-- Installed lifecycle + immutable version history
-- ---------------------------------------------------------------------------

create table if not exists public.whitelabel_installation (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null unique references public.whitelabel_build(id) on delete restrict,
  handoff_id uuid not null unique,
  operation_mode text not null check (operation_mode in ('managed', 'independent', 'rejoining')),
  maintenance_status text not null check (maintenance_status in ('active', 'declined', 'paused', 'ended')),
  current_version_id uuid,
  independent_since timestamptz,
  rejoin_started_at timestamptz,
  rejoined_at timestamptz,
  created_by uuid references public.person(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, build_id),
  foreign key (handoff_id, build_id)
    references public.whitelabel_handoff(id, build_id) on delete restrict
);

drop trigger if exists whitelabel_installation_updated_at on public.whitelabel_installation;
create trigger whitelabel_installation_updated_at
  before update on public.whitelabel_installation
  for each row execute function public.set_updated_at();

create table if not exists public.whitelabel_installation_version (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null,
  build_id uuid not null references public.whitelabel_build(id) on delete restrict,
  ordinal integer not null check (ordinal >= 1),
  source_sha text not null check (char_length(btrim(source_sha)) between 7 and 64),
  schema_release text not null check (char_length(btrim(schema_release)) between 1 and 160),
  deployment_url text not null check (deployment_url ~ '^https://'),
  deployment_ref text,
  origin_kind text not null check (origin_kind in ('handoff', 'update', 'recovery')),
  handoff_id uuid,
  update_attempt_id uuid,
  recovery_run_id uuid,
  promoted_by uuid references public.person(id) on delete set null,
  promoted_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb,
  unique (installation_id, ordinal),
  unique (installation_id, source_sha, schema_release),
  unique (update_attempt_id),
  unique (recovery_run_id),
  unique (id, build_id, installation_id),
  check (
    (origin_kind = 'handoff' and handoff_id is not null and update_attempt_id is null and recovery_run_id is null)
    or (origin_kind = 'update' and handoff_id is null and update_attempt_id is not null and recovery_run_id is null)
    or (origin_kind = 'recovery' and handoff_id is null and update_attempt_id is null and recovery_run_id is not null)
  ),
  foreign key (installation_id, build_id)
    references public.whitelabel_installation(id, build_id) on delete restrict,
  foreign key (handoff_id, build_id)
    references public.whitelabel_handoff(id, build_id) on delete restrict
);

alter table public.whitelabel_installation
  add constraint whitelabel_installation_current_version_build_fk
  foreign key (current_version_id, build_id, id)
  references public.whitelabel_installation_version(id, build_id, installation_id) on delete restrict;

create index if not exists whitelabel_installation_version_history_idx
  on public.whitelabel_installation_version (installation_id, ordinal desc);

-- ---------------------------------------------------------------------------
-- Maintenance history + purchased/custom entitlements
-- ---------------------------------------------------------------------------

create table if not exists public.whitelabel_maintenance_event (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null,
  build_id uuid not null references public.whitelabel_build(id) on delete restrict,
  update_attempt_id uuid,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 160),
  previous_status text check (previous_status is null or previous_status in ('active', 'declined', 'paused', 'ended')),
  new_status text check (new_status is null or new_status in ('active', 'declined', 'paused', 'ended')),
  reason text,
  recorded_by uuid references public.person(id) on delete set null,
  recorded_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb,
  foreign key (installation_id, build_id)
    references public.whitelabel_installation(id, build_id) on delete restrict
);

create index if not exists whitelabel_maintenance_event_history_idx
  on public.whitelabel_maintenance_event (installation_id, recorded_at desc, id desc);

create table if not exists public.whitelabel_installation_entitlement (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null,
  build_id uuid not null references public.whitelabel_build(id) on delete restrict,
  entitlement_key text not null check (entitlement_key ~ '^[a-z0-9][a-z0-9:_-]{0,159}$'),
  source_kind text not null check (source_kind in ('base', 'addition')),
  addition_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 240),
  status text not null default 'active'
    check (status in ('pending_delivery', 'active', 'suspended', 'ended')),
  preservation_notes text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installation_id, entitlement_key),
  unique (addition_id),
  unique (id, build_id, installation_id),
  check (
    (source_kind = 'base' and addition_id is null)
    or (source_kind = 'addition' and addition_id is not null)
  ),
  foreign key (installation_id, build_id)
    references public.whitelabel_installation(id, build_id) on delete restrict,
  foreign key (addition_id, build_id)
    references public.whitelabel_build_addition(id, build_id) on delete restrict
);

drop trigger if exists whitelabel_installation_entitlement_updated_at on public.whitelabel_installation_entitlement;
create trigger whitelabel_installation_entitlement_updated_at
  before update on public.whitelabel_installation_entitlement
  for each row execute function public.set_updated_at();

create index if not exists whitelabel_installation_entitlement_installation_idx
  on public.whitelabel_installation_entitlement (installation_id, status, entitlement_key);

-- ---------------------------------------------------------------------------
-- Release catalog + forward-only customer migration manifest
-- ---------------------------------------------------------------------------

create table if not exists public.whitelabel_release (
  id uuid primary key default gen_random_uuid(),
  release_key text not null unique check (release_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'),
  source_sha text not null check (char_length(btrim(source_sha)) between 7 and 64),
  schema_release text not null check (char_length(btrim(schema_release)) between 1 and 160),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'running', 'paused', 'completed', 'withdrawn')),
  release_notes text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.person(id) on delete set null,
  ready_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_sha, schema_release)
);

drop trigger if exists whitelabel_release_updated_at on public.whitelabel_release;
create trigger whitelabel_release_updated_at
  before update on public.whitelabel_release
  for each row execute function public.set_updated_at();

create table if not exists public.whitelabel_release_migration (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.whitelabel_release(id) on delete cascade,
  ordinal integer not null check (ordinal >= 1),
  migration_name text not null check (char_length(btrim(migration_name)) between 1 and 240),
  schema_release text not null check (char_length(btrim(schema_release)) between 1 and 160),
  migration_sql text not null check (char_length(btrim(migration_sql)) > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  required boolean not null default true,
  recovery_strategy text not null default 'forward_fix'
    check (recovery_strategy in ('forward_fix', 'restore_then_replay')),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (release_id, ordinal),
  unique (release_id, migration_name)
);

-- ---------------------------------------------------------------------------
-- Rollouts pin the exact installed version and entitlement preservation plan.
-- ---------------------------------------------------------------------------

create table if not exists public.whitelabel_rollout (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null,
  build_id uuid not null references public.whitelabel_build(id) on delete restrict,
  release_id uuid not null references public.whitelabel_release(id) on delete restrict,
  from_version_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'notified', 'running', 'verifying', 'succeeded', 'failed', 'recovering', 'recovered', 'cancelled')),
  notification_at timestamptz,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_by uuid references public.person(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installation_id, release_id),
  unique (id, build_id),
  foreign key (installation_id, build_id)
    references public.whitelabel_installation(id, build_id) on delete restrict,
  foreign key (from_version_id, build_id, installation_id)
    references public.whitelabel_installation_version(id, build_id, installation_id) on delete restrict
);

create unique index if not exists whitelabel_rollout_one_active_installation_idx
  on public.whitelabel_rollout (installation_id)
  where status in ('queued', 'notified', 'running', 'verifying', 'recovering');

-- A release mutates at most one customer at a time. A failed attempt pauses the
-- release below, leaving the remaining queued/notified rollouts untouched.
create unique index if not exists whitelabel_rollout_one_mutating_release_idx
  on public.whitelabel_rollout (release_id)
  where status in ('running', 'verifying', 'recovering');

create index if not exists whitelabel_rollout_installation_history_idx
  on public.whitelabel_rollout (installation_id, created_at desc, id desc);

drop trigger if exists whitelabel_rollout_updated_at on public.whitelabel_rollout;
create trigger whitelabel_rollout_updated_at
  before update on public.whitelabel_rollout
  for each row execute function public.set_updated_at();

create table if not exists public.whitelabel_rollout_entitlement (
  id uuid primary key default gen_random_uuid(),
  rollout_id uuid not null,
  installation_id uuid not null,
  build_id uuid not null references public.whitelabel_build(id) on delete restrict,
  entitlement_id uuid not null,
  policy text not null default 'preserve'
    check (policy in ('preserve', 'upgrade', 'manual_review')),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'blocked', 'not_applicable')),
  evidence jsonb not null default '{}'::jsonb,
  verified_by uuid references public.person(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rollout_id, entitlement_id),
  foreign key (rollout_id, build_id)
    references public.whitelabel_rollout(id, build_id) on delete cascade,
  foreign key (installation_id, build_id)
    references public.whitelabel_installation(id, build_id) on delete restrict,
  foreign key (entitlement_id, build_id, installation_id)
    references public.whitelabel_installation_entitlement(id, build_id, installation_id) on delete restrict
);

drop trigger if exists whitelabel_rollout_entitlement_updated_at on public.whitelabel_rollout_entitlement;
create trigger whitelabel_rollout_entitlement_updated_at
  before update on public.whitelabel_rollout_entitlement
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Update attempts never reuse initial provisioning: no clean-data reset exists.
-- ---------------------------------------------------------------------------

create table if not exists public.whitelabel_update_attempt (
  id uuid primary key default gen_random_uuid(),
  rollout_id uuid not null,
  installation_id uuid not null,
  build_id uuid not null references public.whitelabel_build(id) on delete restrict,
  release_id uuid not null references public.whitelabel_release(id) on delete restrict,
  from_version_id uuid not null,
  attempt_number integer not null default 1 check (attempt_number >= 1),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'awaiting_verification', 'succeeded', 'paused', 'recovery_required', 'recovered', 'cancelled')),
  stage text not null default 'preflight'
    check (stage in (
      'preflight',
      'apply_migrations',
      'set_schema_environment',
      'deploy_source',
      'poll_deployment',
      'verify_live',
      'start_post_update_verification',
      'awaiting_verification'
    )),
  verification_run_id uuid,
  target_deployment_ref text,
  target_deployment_url text check (target_deployment_url is null or target_deployment_url ~ '^https://'),
  safe_result jsonb not null default '{}'::jsonb,
  last_error text,
  started_by uuid references public.person(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rollout_id, attempt_number),
  unique (id, build_id, installation_id),
  foreign key (rollout_id, build_id)
    references public.whitelabel_rollout(id, build_id) on delete restrict,
  foreign key (installation_id, build_id)
    references public.whitelabel_installation(id, build_id) on delete restrict,
  foreign key (from_version_id, build_id, installation_id)
    references public.whitelabel_installation_version(id, build_id, installation_id) on delete restrict
);

create unique index if not exists whitelabel_update_attempt_one_active_installation_idx
  on public.whitelabel_update_attempt (installation_id)
  where status in ('scheduled', 'running', 'awaiting_verification', 'paused', 'recovery_required');

create index if not exists whitelabel_update_attempt_history_idx
  on public.whitelabel_update_attempt (installation_id, created_at desc, id desc);

drop trigger if exists whitelabel_update_attempt_updated_at on public.whitelabel_update_attempt;
create trigger whitelabel_update_attempt_updated_at
  before update on public.whitelabel_update_attempt
  for each row execute function public.set_updated_at();

alter table public.whitelabel_installation_version
  add constraint whitelabel_installation_version_update_attempt_build_fk
  foreign key (update_attempt_id, build_id, installation_id)
  references public.whitelabel_update_attempt(id, build_id, installation_id) on delete restrict;

alter table public.whitelabel_maintenance_event
  add constraint whitelabel_maintenance_event_update_attempt_build_fk
  foreign key (update_attempt_id, build_id, installation_id)
  references public.whitelabel_update_attempt(id, build_id, installation_id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Recovery points cover app + database state. Successful DB recovery must
-- explicitly prove records newer than the recovery boundary were preserved.
-- ---------------------------------------------------------------------------

create table if not exists public.whitelabel_recovery_point (
  id uuid primary key default gen_random_uuid(),
  update_attempt_id uuid not null unique,
  installation_id uuid not null,
  build_id uuid not null references public.whitelabel_build(id) on delete restrict,
  from_version_id uuid not null,
  status text not null default 'preparing' check (status in ('preparing', 'ready', 'failed')),
  database_recovery_mode text not null default 'forward_fix'
    check (database_recovery_mode in ('forward_fix', 'restore_then_replay')),
  app_deployment_ref text,
  database_snapshot_ref text,
  database_boundary_at timestamptz,
  database_boundary_token text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.person(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, build_id, installation_id),
  check (
    status <> 'ready'
    or (
      database_boundary_at is not null
      and database_boundary_token is not null
      and (
        database_recovery_mode = 'forward_fix'
        or database_snapshot_ref is not null
      )
    )
  ),
  foreign key (update_attempt_id, build_id, installation_id)
    references public.whitelabel_update_attempt(id, build_id, installation_id) on delete restrict,
  foreign key (installation_id, build_id)
    references public.whitelabel_installation(id, build_id) on delete restrict,
  foreign key (from_version_id, build_id, installation_id)
    references public.whitelabel_installation_version(id, build_id, installation_id) on delete restrict
);

drop trigger if exists whitelabel_recovery_point_updated_at on public.whitelabel_recovery_point;
create trigger whitelabel_recovery_point_updated_at
  before update on public.whitelabel_recovery_point
  for each row execute function public.set_updated_at();

create table if not exists public.whitelabel_recovery_run (
  id uuid primary key default gen_random_uuid(),
  recovery_point_id uuid not null,
  update_attempt_id uuid not null,
  installation_id uuid not null,
  build_id uuid not null references public.whitelabel_build(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  database_recovery_mode text not null default 'forward_fix'
    check (database_recovery_mode in ('forward_fix', 'restore_then_replay')),
  deployment_ref text,
  deployment_url text check (deployment_url is null or deployment_url ~ '^https://'),
  newer_records_preserved boolean not null default true,
  preservation_evidence jsonb not null default '{}'::jsonb,
  last_error text,
  started_by uuid references public.person(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, build_id, installation_id),
  check (
    status <> 'succeeded'
    or (
      deployment_ref is not null
      and deployment_url is not null
      and newer_records_preserved
      and (
        database_recovery_mode = 'forward_fix'
        or preservation_evidence <> '{}'::jsonb
      )
    )
  ),
  foreign key (recovery_point_id, build_id, installation_id)
    references public.whitelabel_recovery_point(id, build_id, installation_id) on delete restrict,
  foreign key (update_attempt_id, build_id, installation_id)
    references public.whitelabel_update_attempt(id, build_id, installation_id) on delete restrict,
  foreign key (installation_id, build_id)
    references public.whitelabel_installation(id, build_id) on delete restrict
);

create unique index if not exists whitelabel_recovery_run_one_active_installation_idx
  on public.whitelabel_recovery_run (installation_id)
  where status in ('pending', 'running');

create index if not exists whitelabel_recovery_run_history_idx
  on public.whitelabel_recovery_run (installation_id, created_at desc, id desc);

drop trigger if exists whitelabel_recovery_run_updated_at on public.whitelabel_recovery_run;
create trigger whitelabel_recovery_run_updated_at
  before update on public.whitelabel_recovery_run
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Verification origins: Ticket 5 handoff keeps its provisioning origin;
-- post-update verification is tied to one update attempt; compatibility checks
-- are tied only to the installed lifecycle. Ticket 5 RPCs are left unchanged.
-- ---------------------------------------------------------------------------

alter table public.whitelabel_verification_run
  alter column provisioning_run_id drop not null,
  add column if not exists installation_id uuid,
  add column if not exists update_attempt_id uuid;

-- Ticket 5's original one-active-per-build index was correct while handoff was
-- the only verification lifecycle. Ticket 6 scopes that invariant to handoff,
-- then adds operational concurrency fences with their own natural origins.
drop index if exists public.whitelabel_verification_one_active_build_idx;
create unique index whitelabel_verification_one_active_build_idx
  on public.whitelabel_verification_run (build_id)
  where kind = 'handoff' and status in ('draft', 'running', 'blocked');

create unique index if not exists whitelabel_verification_one_active_post_update_idx
  on public.whitelabel_verification_run (update_attempt_id)
  where kind = 'post_update'
    and update_attempt_id is not null
    and status in ('draft', 'running');

create unique index if not exists whitelabel_verification_one_running_compatibility_idx
  on public.whitelabel_verification_run (installation_id)
  where kind = 'compatibility'
    and installation_id is not null
    and status = 'running';

alter table public.whitelabel_verification_run
  add constraint whitelabel_verification_run_installation_build_fk
    foreign key (installation_id, build_id)
    references public.whitelabel_installation(id, build_id) on delete restrict,
  add constraint whitelabel_verification_run_update_attempt_build_fk
    foreign key (update_attempt_id, build_id, installation_id)
    references public.whitelabel_update_attempt(id, build_id, installation_id) on delete restrict,
  add constraint whitelabel_verification_run_exact_origin_check
    check (
      (kind = 'handoff'
        and provisioning_run_id is not null
        and installation_id is null
        and update_attempt_id is null)
      or (kind = 'post_update'
        and provisioning_run_id is null
        and installation_id is not null
        and update_attempt_id is not null)
      or (kind = 'compatibility'
        and provisioning_run_id is null
        and installation_id is not null
        and update_attempt_id is null)
    );

alter table public.whitelabel_verification_run
  add constraint whitelabel_verification_run_id_build_installation_unique
    unique (id, build_id, installation_id);

alter table public.whitelabel_update_attempt
  add constraint whitelabel_update_attempt_verification_build_fk
  foreign key (verification_run_id, build_id, installation_id)
  references public.whitelabel_verification_run(id, build_id, installation_id) on delete restrict;

alter table public.whitelabel_installation_version
  add constraint whitelabel_installation_version_recovery_run_build_fk
  foreign key (recovery_run_id, build_id, installation_id)
  references public.whitelabel_recovery_run(id, build_id, installation_id) on delete restrict;

create index if not exists whitelabel_verification_installation_created_idx
  on public.whitelabel_verification_run (installation_id, created_at desc, id desc)
  where installation_id is not null;

-- ---------------------------------------------------------------------------
-- Service-role-only control-plane tables.
-- ---------------------------------------------------------------------------

alter table public.whitelabel_installation enable row level security;
alter table public.whitelabel_installation_version enable row level security;
alter table public.whitelabel_maintenance_event enable row level security;
alter table public.whitelabel_installation_entitlement enable row level security;
alter table public.whitelabel_release enable row level security;
alter table public.whitelabel_release_migration enable row level security;
alter table public.whitelabel_rollout enable row level security;
alter table public.whitelabel_rollout_entitlement enable row level security;
alter table public.whitelabel_update_attempt enable row level security;
alter table public.whitelabel_recovery_point enable row level security;
alter table public.whitelabel_recovery_run enable row level security;

revoke all on table public.whitelabel_installation from anon, authenticated;
revoke all on table public.whitelabel_installation_version from anon, authenticated;
revoke all on table public.whitelabel_maintenance_event from anon, authenticated;
revoke all on table public.whitelabel_installation_entitlement from anon, authenticated;
revoke all on table public.whitelabel_release from anon, authenticated;
revoke all on table public.whitelabel_release_migration from anon, authenticated;
revoke all on table public.whitelabel_rollout from anon, authenticated;
revoke all on table public.whitelabel_rollout_entitlement from anon, authenticated;
revoke all on table public.whitelabel_update_attempt from anon, authenticated;
revoke all on table public.whitelabel_recovery_point from anon, authenticated;
revoke all on table public.whitelabel_recovery_run from anon, authenticated;

grant select, insert, update on table public.whitelabel_installation to service_role;
grant select, insert on table public.whitelabel_installation_version to service_role;
grant select, insert on table public.whitelabel_maintenance_event to service_role;
grant select, insert, update on table public.whitelabel_installation_entitlement to service_role;
grant select, insert, update on table public.whitelabel_release to service_role;
grant select, insert, update, delete on table public.whitelabel_release_migration to service_role;
grant select, insert, update on table public.whitelabel_rollout to service_role;
grant select, insert, update on table public.whitelabel_rollout_entitlement to service_role;
grant select, insert, update on table public.whitelabel_update_attempt to service_role;
grant select, insert, update on table public.whitelabel_recovery_point to service_role;
grant select, insert, update on table public.whitelabel_recovery_run to service_role;

-- ---------------------------------------------------------------------------
-- Database-enforced history/state protections.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_whitelabel_append_only_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'whitelabel_history_is_append_only';
end;
$$;

create or replace function public.guard_whitelabel_release_state_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft' and (
    new.release_key is distinct from old.release_key
    or new.source_sha is distinct from old.source_sha
    or new.schema_release is distinct from old.schema_release
  ) then
    raise exception 'whitelabel_release_identity_immutable_after_draft';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('ready', 'withdrawn'))
    or (old.status = 'ready' and new.status in ('running', 'paused', 'withdrawn'))
    or (old.status = 'running' and new.status in ('paused', 'completed', 'withdrawn'))
    or (old.status = 'paused' and new.status in ('running', 'withdrawn'))
  ) then
    raise exception 'whitelabel_invalid_release_status_transition';
  end if;
  return new;
end;
$$;

drop trigger if exists whitelabel_release_state_guard on public.whitelabel_release;
create trigger whitelabel_release_state_guard
  before update of release_key, source_sha, schema_release, status on public.whitelabel_release
  for each row execute function public.guard_whitelabel_release_state_transition();

create or replace function public.guard_whitelabel_release_migration_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_release_id uuid := coalesce(new.release_id, old.release_id);
  v_status text;
begin
  select status into v_status from public.whitelabel_release where id = v_release_id;
  if v_status is null then
    raise exception 'whitelabel_release_not_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'whitelabel_release_migrations_immutable_after_ready';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists whitelabel_release_migration_draft_only on public.whitelabel_release_migration;
create trigger whitelabel_release_migration_draft_only
  before insert or update or delete on public.whitelabel_release_migration
  for each row execute function public.guard_whitelabel_release_migration_mutation();

create or replace function public.guard_whitelabel_installation_version_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.origin_kind = 'handoff' then
    if not exists (
      select 1
      from public.whitelabel_handoff handoff
      where handoff.id = new.handoff_id
        and handoff.build_id = new.build_id
        and handoff.status = 'delivered'
        and handoff.installed_source_sha = new.source_sha
        and handoff.schema_release = new.schema_release
        and handoff.os_url = new.deployment_url
    ) then
      raise exception 'whitelabel_version_ledger_requires_delivered_handoff';
    end if;
  elsif new.origin_kind = 'update' then
    if not exists (
      select 1
      from public.whitelabel_verification_run verification
      join public.whitelabel_update_attempt attempt
        on attempt.id = verification.update_attempt_id
       and attempt.build_id = verification.build_id
       and attempt.installation_id = verification.installation_id
      where verification.build_id = new.build_id
        and verification.installation_id = new.installation_id
        and verification.update_attempt_id = new.update_attempt_id
        and verification.id = attempt.verification_run_id
        and verification.kind = 'post_update'
        and verification.status = 'passed'
        and verification.source_sha = new.source_sha
        and verification.schema_release = new.schema_release
        and verification.deployment_url = new.deployment_url
    ) then
      raise exception 'whitelabel_version_ledger_requires_passed_post_update_verification';
    end if;
  elsif new.origin_kind = 'recovery' then
    if not exists (
      select 1
      from public.whitelabel_recovery_run recovery
      join public.whitelabel_update_attempt attempt
        on attempt.id = recovery.update_attempt_id
       and attempt.build_id = recovery.build_id
       and attempt.installation_id = recovery.installation_id
      join public.whitelabel_installation_version prior
        on prior.id = attempt.from_version_id
       and prior.build_id = attempt.build_id
       and prior.installation_id = attempt.installation_id
      where recovery.id = new.recovery_run_id
        and recovery.build_id = new.build_id
        and recovery.installation_id = new.installation_id
        and recovery.status = 'succeeded'
        and recovery.newer_records_preserved
        and prior.source_sha = new.source_sha
    ) then
      raise exception 'whitelabel_version_ledger_requires_active_recovery';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists whitelabel_installation_version_insert_guard on public.whitelabel_installation_version;
create trigger whitelabel_installation_version_insert_guard
  before insert on public.whitelabel_installation_version
  for each row execute function public.guard_whitelabel_installation_version_insert();

drop trigger if exists whitelabel_installation_version_append_only on public.whitelabel_installation_version;
create trigger whitelabel_installation_version_append_only
  before update or delete on public.whitelabel_installation_version
  for each row execute function public.prevent_whitelabel_append_only_history_mutation();

drop trigger if exists whitelabel_maintenance_event_append_only on public.whitelabel_maintenance_event;
create trigger whitelabel_maintenance_event_append_only
  before update or delete on public.whitelabel_maintenance_event
  for each row execute function public.prevent_whitelabel_append_only_history_mutation();

create or replace function public.guard_whitelabel_installation_state_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.operation_mode is distinct from old.operation_mode
     and not (
       (old.operation_mode = 'managed' and new.operation_mode = 'independent')
       or (old.operation_mode = 'independent' and new.operation_mode = 'rejoining')
       or (old.operation_mode = 'rejoining' and new.operation_mode in ('managed', 'independent'))
     ) then
    raise exception 'whitelabel_invalid_operation_mode_transition';
  end if;

  if new.maintenance_status is distinct from old.maintenance_status
     and not (
       (old.maintenance_status = 'active' and new.maintenance_status in ('paused', 'ended'))
       or (old.maintenance_status = 'paused' and new.maintenance_status in ('active', 'ended'))
       or (old.maintenance_status in ('declined', 'ended') and new.maintenance_status = 'active')
     ) then
    raise exception 'whitelabel_invalid_maintenance_transition';
  end if;
  return new;
end;
$$;

drop trigger if exists whitelabel_installation_state_guard on public.whitelabel_installation;
create trigger whitelabel_installation_state_guard
  before update of operation_mode, maintenance_status on public.whitelabel_installation
  for each row execute function public.guard_whitelabel_installation_state_transition();

create or replace function public.guard_whitelabel_installed_version_pointer()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_version public.whitelabel_installation_version%rowtype;
begin
  if new.current_version_id is not distinct from old.current_version_id then
    return new;
  end if;
  if new.current_version_id is null then
    raise exception 'whitelabel_installed_version_cannot_be_cleared';
  end if;

  select * into v_version
  from public.whitelabel_installation_version
  where id = new.current_version_id
    and installation_id = new.id
    and build_id = new.build_id;
  if not found then
    raise exception 'whitelabel_installed_version_not_found';
  end if;

  if old.current_version_id is null then
    if v_version.origin_kind <> 'handoff' then
      raise exception 'whitelabel_initial_version_requires_handoff';
    end if;
    return new;
  end if;

  if v_version.origin_kind = 'update' then
    if v_version.update_attempt_id is null or not exists (
      select 1
      from public.whitelabel_verification_run verification
      join public.whitelabel_update_attempt attempt
        on attempt.id = verification.update_attempt_id
       and attempt.build_id = verification.build_id
       and attempt.installation_id = verification.installation_id
      where verification.build_id = new.build_id
        and verification.installation_id = new.id
        and verification.update_attempt_id = v_version.update_attempt_id
        and verification.id = attempt.verification_run_id
        and verification.kind = 'post_update'
        and verification.status = 'passed'
        and verification.source_sha = v_version.source_sha
        and verification.schema_release = v_version.schema_release
    ) then
      raise exception 'whitelabel_version_promotion_requires_passed_post_update_verification';
    end if;
  elsif v_version.origin_kind = 'recovery' then
    if v_version.recovery_run_id is null or not exists (
      select 1 from public.whitelabel_recovery_run recovery
      where recovery.id = v_version.recovery_run_id
        and recovery.build_id = new.build_id
        and recovery.installation_id = new.id
        and recovery.status = 'succeeded'
        and recovery.newer_records_preserved
    ) then
      raise exception 'whitelabel_recovery_version_requires_active_recovery';
    end if;
  else
    raise exception 'whitelabel_version_promotion_origin_invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists whitelabel_installation_version_pointer_guard on public.whitelabel_installation;
create trigger whitelabel_installation_version_pointer_guard
  before update of current_version_id on public.whitelabel_installation
  for each row execute function public.guard_whitelabel_installed_version_pointer();

create or replace function public.guard_whitelabel_rollout_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_installation public.whitelabel_installation%rowtype;
  v_release_status text;
begin
  select * into v_installation
  from public.whitelabel_installation
  where id = new.installation_id and build_id = new.build_id;
  if not found then
    raise exception 'whitelabel_installation_not_found';
  end if;
  select status into v_release_status from public.whitelabel_release where id = new.release_id;
  if v_release_status is null or v_release_status = 'withdrawn' then
    raise exception 'whitelabel_rollout_release_unavailable';
  end if;
  if new.status in ('running', 'verifying')
     and v_release_status not in ('ready', 'running') then
    raise exception 'whitelabel_rollout_release_not_running';
  end if;
  if new.status in ('queued', 'notified', 'running', 'verifying', 'recovering') then
    if v_installation.operation_mode <> 'managed' then
      raise exception 'whitelabel_independent_installation_updates_blocked';
    end if;
    if v_installation.maintenance_status <> 'active' then
      raise exception 'whitelabel_update_requires_active_maintenance';
    end if;
    if new.from_version_id <> v_installation.current_version_id then
      raise exception 'whitelabel_rollout_from_version_is_stale';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists whitelabel_rollout_state_guard on public.whitelabel_rollout;
create trigger whitelabel_rollout_state_guard
  before insert or update of status, from_version_id, release_id on public.whitelabel_rollout
  for each row execute function public.guard_whitelabel_rollout_state();

create or replace function public.guard_whitelabel_update_attempt_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_installation public.whitelabel_installation%rowtype;
  v_rollout public.whitelabel_rollout%rowtype;
  v_release_status text;
begin
  select * into v_installation
  from public.whitelabel_installation
  where id = new.installation_id and build_id = new.build_id;
  if not found then
    raise exception 'whitelabel_installation_not_found';
  end if;
  select * into v_rollout
  from public.whitelabel_rollout
  where id = new.rollout_id and build_id = new.build_id;
  if not found then
    raise exception 'whitelabel_rollout_not_found';
  end if;
  select status into v_release_status
  from public.whitelabel_release
  where id = new.release_id;
  if v_release_status is null then
    raise exception 'whitelabel_release_not_found';
  end if;

  if new.release_id <> v_rollout.release_id
     or new.from_version_id <> v_rollout.from_version_id
     or new.installation_id <> v_rollout.installation_id then
    raise exception 'whitelabel_update_attempt_rollout_mismatch';
  end if;

  if new.status in ('scheduled', 'running', 'awaiting_verification', 'paused', 'recovery_required') then
    if v_installation.operation_mode <> 'managed' then
      raise exception 'whitelabel_independent_installation_updates_blocked';
    end if;
    if v_installation.maintenance_status <> 'active' then
      raise exception 'whitelabel_update_requires_active_maintenance';
    end if;
    if v_installation.current_version_id <> new.from_version_id then
      raise exception 'whitelabel_update_attempt_from_version_is_stale';
    end if;
    if new.status in ('scheduled', 'running', 'awaiting_verification')
       and v_release_status not in ('ready', 'running') then
      raise exception 'whitelabel_update_release_paused';
    end if;
    if exists (
      select 1
      from public.whitelabel_installation_entitlement entitlement
      where entitlement.installation_id = new.installation_id
        and entitlement.status in ('pending_delivery', 'active')
        and not exists (
          select 1
          from public.whitelabel_rollout_entitlement snapshot
          where snapshot.rollout_id = new.rollout_id
            and snapshot.entitlement_id = entitlement.id
            and snapshot.status = 'verified'
        )
    ) then
      raise exception 'whitelabel_update_entitlements_not_verified';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists whitelabel_update_attempt_state_guard on public.whitelabel_update_attempt;
create trigger whitelabel_update_attempt_state_guard
  before insert or update of status, rollout_id, release_id, from_version_id on public.whitelabel_update_attempt
  for each row execute function public.guard_whitelabel_update_attempt_state();

create or replace function public.pause_whitelabel_release_on_update_failure()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'recovery_required' and old.status is distinct from new.status then
    update public.whitelabel_release
    set status = 'paused'
    where id = new.release_id and status in ('ready', 'running');
  end if;
  return new;
end;
$$;

drop trigger if exists whitelabel_update_attempt_pause_release on public.whitelabel_update_attempt;
create trigger whitelabel_update_attempt_pause_release
  after update of status on public.whitelabel_update_attempt
  for each row execute function public.pause_whitelabel_release_on_update_failure();

-- ---------------------------------------------------------------------------
-- Bootstrap from the immutable DELIVERED Ticket 5 handoff.
-- ---------------------------------------------------------------------------

create or replace function public.bootstrap_whitelabel_installation_lifecycle(
  p_build_id uuid,
  p_handoff_id uuid,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handoff public.whitelabel_handoff%rowtype;
  v_installation_id uuid;
  v_version_id uuid;
begin
  select * into v_handoff
  from public.whitelabel_handoff
  where id = p_handoff_id and build_id = p_build_id
  for update;
  if not found or v_handoff.status <> 'delivered' then
    raise exception 'whitelabel_lifecycle_requires_delivered_handoff';
  end if;

  select id into v_installation_id
  from public.whitelabel_installation
  where build_id = p_build_id;
  if found then
    if not exists (
      select 1 from public.whitelabel_installation
      where id = v_installation_id and handoff_id = p_handoff_id
    ) then
      raise exception 'whitelabel_installation_handoff_mismatch';
    end if;
    return v_installation_id;
  end if;

  insert into public.whitelabel_installation (
    build_id, handoff_id, operation_mode, maintenance_status,
    independent_since, created_by
  ) values (
    p_build_id,
    p_handoff_id,
    case when v_handoff.maintenance_status = 'selected' then 'managed' else 'independent' end,
    case when v_handoff.maintenance_status = 'selected' then 'active' else 'declined' end,
    case when v_handoff.maintenance_status = 'declined' then coalesce(v_handoff.handoff_at, now()) else null end,
    p_actor_id
  ) returning id into v_installation_id;

  insert into public.whitelabel_installation_version (
    installation_id, build_id, ordinal, source_sha, schema_release,
    deployment_url, origin_kind, handoff_id, promoted_by, promoted_at,
    safe_metadata
  ) values (
    v_installation_id, p_build_id, 1, v_handoff.installed_source_sha,
    v_handoff.schema_release, v_handoff.os_url, 'handoff', v_handoff.id,
    p_actor_id, coalesce(v_handoff.handoff_at, now()),
    jsonb_build_object('ticket5HandoffId', v_handoff.id)
  ) returning id into v_version_id;

  update public.whitelabel_installation
  set current_version_id = v_version_id
  where id = v_installation_id and build_id = p_build_id;

  insert into public.whitelabel_maintenance_event (
    installation_id, build_id, event_type, previous_status, new_status,
    reason, recorded_by, recorded_at
  ) values (
    v_installation_id,
    p_build_id,
    case when v_handoff.maintenance_status = 'selected' then 'maintenance_started' else 'maintenance_declined' end,
    null,
    case when v_handoff.maintenance_status = 'selected' then 'active' else 'declined' end,
    'Bootstrapped from canonical Ticket 5 handoff.',
    p_actor_id,
    coalesce(v_handoff.handoff_at, now())
  );

  insert into public.whitelabel_installation_entitlement (
    installation_id, build_id, entitlement_key, source_kind, name, status,
    preservation_notes
  ) values (
    v_installation_id, p_build_id, 'base:standard-os', 'base', 'Standard OS', 'active',
    'Base customer OS entitlement established at handoff.'
  );

  insert into public.whitelabel_installation_entitlement (
    installation_id, build_id, entitlement_key, source_kind, addition_id,
    name, status, preservation_notes
  )
  select
    v_installation_id,
    p_build_id,
    'addition:' || addition.id::text,
    'addition',
    addition.id,
    addition.name,
    case when addition.status = 'ready' then 'active' else 'pending_delivery' end,
    addition.delivery_requirements
  from public.whitelabel_build_addition addition
  where addition.build_id = p_build_id
  on conflict (addition_id) do nothing;

  return v_installation_id;
end;
$$;

create or replace function public.sync_whitelabel_installation_entitlements(
  p_build_id uuid,
  p_installation_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before_active integer;
  v_after_active integer;
  v_total integer;
begin
  if not exists (
    select 1 from public.whitelabel_installation
    where id = p_installation_id and build_id = p_build_id
  ) then
    raise exception 'whitelabel_installation_not_found';
  end if;

  select count(*) into v_before_active
  from public.whitelabel_installation_entitlement
  where installation_id = p_installation_id
    and build_id = p_build_id
    and source_kind = 'addition'
    and status = 'active';

  insert into public.whitelabel_installation_entitlement (
    installation_id, build_id, entitlement_key, source_kind, name, status,
    preservation_notes
  ) values (
    p_installation_id, p_build_id, 'base:standard-os', 'base', 'Standard OS', 'active',
    'Base customer OS entitlement established at handoff.'
  )
  on conflict (installation_id, entitlement_key) do nothing;

  insert into public.whitelabel_installation_entitlement (
    installation_id, build_id, entitlement_key, source_kind, addition_id,
    name, status, preservation_notes
  )
  select
    p_installation_id,
    p_build_id,
    'addition:' || addition.id::text,
    'addition',
    addition.id,
    addition.name,
    case when addition.status = 'ready' then 'active' else 'pending_delivery' end,
    addition.delivery_requirements
  from public.whitelabel_build_addition addition
  where addition.build_id = p_build_id
  on conflict (addition_id) do update
  set name = excluded.name,
      preservation_notes = excluded.preservation_notes,
      status = case
        when public.whitelabel_installation_entitlement.status = 'pending_delivery'
             and excluded.status = 'active' then 'active'
        else public.whitelabel_installation_entitlement.status
      end;

  select count(*) filter (where status = 'active'), count(*)
  into v_after_active, v_total
  from public.whitelabel_installation_entitlement
  where installation_id = p_installation_id
    and build_id = p_build_id
    and source_kind = 'addition';

  if v_after_active > v_before_active then
    insert into public.whitelabel_maintenance_event (
      installation_id, build_id, event_type, reason, recorded_by, detail
    ) values (
      p_installation_id,
      p_build_id,
      'entitlements_synced',
      'Purchased additions synchronized from the Assembly Line scope.',
      p_actor_id,
      jsonb_build_object(
        'activated', v_after_active - v_before_active,
        'activeAdditions', v_after_active,
        'totalAdditions', v_total
      )
    );
  end if;

  return jsonb_build_object(
    'activated', greatest(v_after_active - v_before_active, 0),
    'activeAdditions', v_after_active,
    'totalAdditions', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Maintenance / independent-operation / rejoin transitions.
-- ---------------------------------------------------------------------------

create or replace function public.transition_whitelabel_maintenance_status(
  p_build_id uuid,
  p_installation_id uuid,
  p_new_status text,
  p_actor_id uuid,
  p_reason text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installation public.whitelabel_installation%rowtype;
  v_event_type text;
begin
  if p_new_status not in ('active', 'declined', 'paused', 'ended') then
    raise exception 'whitelabel_invalid_maintenance_status';
  end if;
  select * into v_installation
  from public.whitelabel_installation
  where id = p_installation_id and build_id = p_build_id
  for update;
  if not found then raise exception 'whitelabel_installation_not_found'; end if;
  if v_installation.maintenance_status = p_new_status then return p_new_status; end if;

  if p_new_status <> 'active' then
    if exists (
      select 1
      from public.whitelabel_rollout
      where installation_id = p_installation_id
        and build_id = p_build_id
        and status in ('running', 'verifying')
    ) then
      raise exception 'whitelabel_cannot_change_maintenance_during_active_update';
    end if;

    update public.whitelabel_update_attempt attempt
    set status = 'cancelled',
        completed_at = now(),
        last_error = coalesce(nullif(btrim(p_reason), ''), 'Maintenance is no longer active.')
    from public.whitelabel_rollout rollout
    where attempt.rollout_id = rollout.id
      and attempt.installation_id = p_installation_id
      and attempt.build_id = p_build_id
      and attempt.status = 'scheduled'
      and rollout.status in ('queued', 'notified');

    update public.whitelabel_rollout
    set status = 'cancelled',
        completed_at = now(),
        last_error = coalesce(nullif(btrim(p_reason), ''), 'Maintenance is no longer active.')
    where installation_id = p_installation_id
      and build_id = p_build_id
      and status in ('queued', 'notified');
  end if;

  v_event_type := case
    when p_new_status = 'active' and v_installation.maintenance_status = 'paused' then 'maintenance_resumed'
    when p_new_status = 'active' then 'maintenance_started'
    when p_new_status = 'paused' then 'maintenance_paused'
    when p_new_status = 'ended' then 'maintenance_ended'
    else 'maintenance_declined'
  end;

  update public.whitelabel_installation
  set maintenance_status = p_new_status
  where id = p_installation_id and build_id = p_build_id;

  insert into public.whitelabel_maintenance_event (
    installation_id, build_id, event_type, previous_status, new_status, reason, recorded_by
  ) values (
    p_installation_id, p_build_id, v_event_type,
    v_installation.maintenance_status, p_new_status, nullif(btrim(p_reason), ''), p_actor_id
  );
  return p_new_status;
end;
$$;

create or replace function public.enter_whitelabel_independent_operation(
  p_build_id uuid,
  p_installation_id uuid,
  p_actor_id uuid,
  p_reason text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installation public.whitelabel_installation%rowtype;
begin
  select * into v_installation
  from public.whitelabel_installation
  where id = p_installation_id and build_id = p_build_id
  for update;
  if not found then raise exception 'whitelabel_installation_not_found'; end if;
  if v_installation.operation_mode = 'independent' then return 'independent'; end if;
  if v_installation.operation_mode not in ('managed', 'rejoining') then
    raise exception 'whitelabel_invalid_independent_transition';
  end if;
  if exists (
    select 1 from public.whitelabel_rollout
    where installation_id = p_installation_id
      and status in ('running', 'verifying', 'recovering')
  ) then
    raise exception 'whitelabel_cannot_go_independent_during_active_update';
  end if;

  update public.whitelabel_update_attempt attempt
  set status = 'cancelled', completed_at = now(), last_error = coalesce(nullif(btrim(p_reason), ''), 'Installation entered independent operation.')
  from public.whitelabel_rollout rollout
  where attempt.rollout_id = rollout.id
    and attempt.installation_id = p_installation_id
    and attempt.build_id = p_build_id
    and attempt.status = 'scheduled'
    and rollout.status in ('queued', 'notified');

  update public.whitelabel_rollout
  set status = 'cancelled', completed_at = now(), last_error = coalesce(nullif(btrim(p_reason), ''), 'Installation entered independent operation.')
  where installation_id = p_installation_id
    and build_id = p_build_id
    and status in ('queued', 'notified');

  update public.whitelabel_installation
  set operation_mode = 'independent',
      independent_since = case
        when v_installation.operation_mode = 'managed' then now()
        else coalesce(v_installation.independent_since, now())
      end,
      rejoin_started_at = null
  where id = p_installation_id and build_id = p_build_id;

  insert into public.whitelabel_maintenance_event (
    installation_id, build_id, event_type, reason, recorded_by, detail
  ) values (
    p_installation_id,
    p_build_id,
    case when v_installation.operation_mode = 'rejoining' then 'rejoin_cancelled_independent' else 'independent_operation_started' end,
    nullif(btrim(p_reason), ''),
    p_actor_id,
    jsonb_build_object('previousMode', v_installation.operation_mode, 'newMode', 'independent')
  );
  return 'independent';
end;
$$;

create or replace function public.begin_whitelabel_rejoin(
  p_build_id uuid,
  p_installation_id uuid,
  p_actor_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installation public.whitelabel_installation%rowtype;
begin
  select * into v_installation
  from public.whitelabel_installation
  where id = p_installation_id and build_id = p_build_id
  for update;
  if not found then raise exception 'whitelabel_installation_not_found'; end if;
  if v_installation.operation_mode = 'rejoining' then return 'rejoining'; end if;
  if v_installation.operation_mode <> 'independent' then
    raise exception 'whitelabel_rejoin_requires_independent_installation';
  end if;
  if v_installation.maintenance_status <> 'active' then
    raise exception 'whitelabel_rejoin_requires_active_maintenance';
  end if;
  update public.whitelabel_installation
  set operation_mode = 'rejoining', rejoin_started_at = now()
  where id = p_installation_id and build_id = p_build_id;

  insert into public.whitelabel_maintenance_event (
    installation_id, build_id, event_type, recorded_by, detail
  ) values (
    p_installation_id,
    p_build_id,
    'rejoin_started',
    p_actor_id,
    jsonb_build_object('previousMode', 'independent', 'newMode', 'rejoining')
  );
  return 'rejoining';
end;
$$;

create or replace function public.complete_whitelabel_rejoin(
  p_build_id uuid,
  p_installation_id uuid,
  p_actor_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installation public.whitelabel_installation%rowtype;
  v_version public.whitelabel_installation_version%rowtype;
begin
  select * into v_installation
  from public.whitelabel_installation
  where id = p_installation_id and build_id = p_build_id
  for update;
  if not found then raise exception 'whitelabel_installation_not_found'; end if;
  if v_installation.operation_mode = 'managed' then return 'managed'; end if;
  if v_installation.operation_mode <> 'rejoining' or v_installation.rejoin_started_at is null then
    raise exception 'whitelabel_rejoin_not_started';
  end if;
  select * into v_version
  from public.whitelabel_installation_version
  where id = v_installation.current_version_id
    and installation_id = p_installation_id
    and build_id = p_build_id;
  if not found then raise exception 'whitelabel_installed_version_not_found'; end if;
  if not exists (
    select 1 from public.whitelabel_verification_run verification
    where verification.installation_id = p_installation_id
      and verification.build_id = p_build_id
      and verification.kind = 'compatibility'
      and verification.status = 'passed'
      and verification.source_sha = v_version.source_sha
      and verification.schema_release = v_version.schema_release
      and verification.completed_at >= v_installation.rejoin_started_at
  ) then
    raise exception 'whitelabel_rejoin_requires_passed_compatibility_verification';
  end if;
  update public.whitelabel_installation
  set operation_mode = 'managed', rejoined_at = now()
  where id = p_installation_id and build_id = p_build_id;

  insert into public.whitelabel_maintenance_event (
    installation_id, build_id, event_type, recorded_by, detail
  ) values (
    p_installation_id,
    p_build_id,
    'rejoin_completed',
    p_actor_id,
    jsonb_build_object('previousMode', 'rejoining', 'newMode', 'managed')
  );
  return 'managed';
end;
$$;

-- ---------------------------------------------------------------------------
-- Operational verification is separate from the immutable Ticket 5 handoff
-- RPC. It can start only from a pinned update attempt or installed version.
-- ---------------------------------------------------------------------------

create or replace function public.start_whitelabel_operational_verification(
  p_build_id uuid,
  p_installation_id uuid,
  p_kind text,
  p_update_attempt_id uuid,
  p_source_sha text,
  p_schema_release text,
  p_deployment_url text,
  p_started_by uuid,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_installation public.whitelabel_installation%rowtype;
  v_version public.whitelabel_installation_version%rowtype;
  v_attempt public.whitelabel_update_attempt%rowtype;
  v_release public.whitelabel_release%rowtype;
begin
  if p_kind not in ('post_update', 'compatibility') then
    raise exception 'whitelabel_operational_verification_kind_invalid';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'verification_items_must_be_array';
  end if;
  select * into v_installation
  from public.whitelabel_installation
  where id = p_installation_id and build_id = p_build_id;
  if not found then raise exception 'whitelabel_installation_not_found'; end if;

  if p_kind = 'post_update' then
    if p_update_attempt_id is null then
      raise exception 'whitelabel_post_update_verification_requires_attempt';
    end if;
    if v_installation.operation_mode <> 'managed' or v_installation.maintenance_status <> 'active' then
      raise exception 'whitelabel_post_update_verification_requires_managed_installation';
    end if;
    select * into v_attempt
    from public.whitelabel_update_attempt
    where id = p_update_attempt_id
      and installation_id = p_installation_id
      and build_id = p_build_id
    for update;
    if not found
       or v_attempt.status <> 'running'
       or v_attempt.stage <> 'start_post_update_verification' then
      raise exception 'whitelabel_post_update_verification_attempt_not_ready';
    end if;
    select * into v_release from public.whitelabel_release where id = v_attempt.release_id;
    if not found
       or v_release.source_sha <> p_source_sha
       or v_release.schema_release <> p_schema_release
       or v_attempt.target_deployment_url is null
       or v_attempt.target_deployment_url <> p_deployment_url then
      raise exception 'whitelabel_post_update_verification_version_mismatch';
    end if;
  else
    if p_update_attempt_id is not null then
      raise exception 'whitelabel_compatibility_verification_has_no_attempt';
    end if;
    select * into v_version
    from public.whitelabel_installation_version
    where id = v_installation.current_version_id
      and installation_id = p_installation_id
      and build_id = p_build_id;
    if not found
       or v_version.source_sha <> p_source_sha
       or v_version.schema_release <> p_schema_release
       or v_version.deployment_url <> p_deployment_url then
      raise exception 'whitelabel_compatibility_verification_version_mismatch';
    end if;
  end if;

  insert into public.whitelabel_verification_run (
    build_id, provisioning_run_id, installation_id, update_attempt_id,
    kind, source_sha, schema_release, deployment_url, status, started_by
  ) values (
    p_build_id, null, p_installation_id,
    case when p_kind = 'post_update' then p_update_attempt_id else null end,
    p_kind, p_source_sha, p_schema_release, p_deployment_url, 'running', p_started_by
  ) returning id into v_run_id;

  insert into public.whitelabel_verification_item (
    run_id, build_id, check_key, label, category, mode, source_kind,
    addition_id, required_for_handoff, status, expected_summary,
    actual_summary, evidence, checked_by, checked_at
  )
  select
    v_run_id,
    p_build_id,
    item->>'checkKey',
    item->>'label',
    item->>'category',
    item->>'mode',
    coalesce(item->>'sourceKind', 'base'),
    nullif(item->>'additionId', '')::uuid,
    coalesce((item->>'requiredForHandoff')::boolean, true),
    coalesce(item->>'status', 'pending'),
    nullif(item->>'expectedSummary', ''),
    nullif(item->>'actualSummary', ''),
    coalesce(item->'evidence', '{}'::jsonb),
    case when item->>'status' in ('passed', 'failed', 'not_applicable') then p_started_by else null end,
    case when item->>'status' in ('passed', 'failed', 'not_applicable') then now() else null end
  from jsonb_array_elements(p_items) item;

  if p_kind = 'post_update' then
    update public.whitelabel_update_attempt
    set status = 'awaiting_verification',
        stage = 'awaiting_verification',
        verification_run_id = v_run_id
    where id = p_update_attempt_id
      and build_id = p_build_id
      and installation_id = p_installation_id;
    update public.whitelabel_rollout
    set status = 'verifying'
    where id = v_attempt.rollout_id and build_id = p_build_id;
  end if;

  return v_run_id;
end;
$$;

create or replace function public.finalize_whitelabel_operational_verification(
  p_build_id uuid,
  p_run_id uuid,
  p_actor_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.whitelabel_verification_run%rowtype;
  v_status text;
begin
  select * into v_run
  from public.whitelabel_verification_run
  where id = p_run_id
    and build_id = p_build_id
    and kind in ('post_update', 'compatibility')
  for update;
  if not found then raise exception 'operational_verification_run_not_found'; end if;

  if exists (
    select 1 from public.whitelabel_verification_item
    where run_id = p_run_id and required_for_handoff and status <> 'passed'
  ) then
    v_status := 'blocked';
    update public.whitelabel_verification_run
    set status = 'blocked', completed_by = null, completed_at = null
    where id = p_run_id and build_id = p_build_id;
  else
    v_status := 'passed';
    update public.whitelabel_verification_run
    set status = 'passed', completed_by = p_actor_id, completed_at = now()
    where id = p_run_id and build_id = p_build_id;
  end if;
  return v_status;
end;
$$;

-- Promotion is the only valid path from a verified update attempt into the
-- installed-version ledger. The installation pointer trigger independently
-- checks the passed post-update verification before accepting the new pointer.
create or replace function public.promote_whitelabel_installed_version(
  p_build_id uuid,
  p_installation_id uuid,
  p_update_attempt_id uuid,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installation public.whitelabel_installation%rowtype;
  v_attempt public.whitelabel_update_attempt%rowtype;
  v_release public.whitelabel_release%rowtype;
  v_existing_version_id uuid;
  v_version_id uuid;
  v_ordinal integer;
begin
  select id into v_existing_version_id
  from public.whitelabel_installation_version
  where update_attempt_id = p_update_attempt_id;
  if found then return v_existing_version_id; end if;

  select * into v_installation
  from public.whitelabel_installation
  where id = p_installation_id and build_id = p_build_id
  for update;
  if not found then raise exception 'whitelabel_installation_not_found'; end if;
  if v_installation.operation_mode <> 'managed' or v_installation.maintenance_status <> 'active' then
    raise exception 'whitelabel_version_promotion_requires_managed_installation';
  end if;

  select * into v_attempt
  from public.whitelabel_update_attempt
  where id = p_update_attempt_id
    and installation_id = p_installation_id
    and build_id = p_build_id
  for update;
  if not found
     or v_attempt.status <> 'awaiting_verification'
     or v_attempt.stage <> 'awaiting_verification'
     or v_attempt.verification_run_id is null then
    raise exception 'whitelabel_version_promotion_attempt_not_awaiting_verification';
  end if;
  if v_attempt.from_version_id <> v_installation.current_version_id then
    raise exception 'whitelabel_version_promotion_from_version_is_stale';
  end if;
  if v_attempt.target_deployment_url is null then
    raise exception 'whitelabel_version_promotion_deployment_required';
  end if;

  select * into v_release from public.whitelabel_release where id = v_attempt.release_id;
  if not found or v_release.status in ('draft', 'withdrawn') then
    raise exception 'whitelabel_version_promotion_release_unavailable';
  end if;

  if not exists (
    select 1 from public.whitelabel_verification_run verification
    where verification.build_id = p_build_id
      and verification.installation_id = p_installation_id
      and verification.update_attempt_id = p_update_attempt_id
      and verification.id = v_attempt.verification_run_id
      and verification.kind = 'post_update'
      and verification.status = 'passed'
      and verification.source_sha = v_release.source_sha
      and verification.schema_release = v_release.schema_release
      and verification.deployment_url = v_attempt.target_deployment_url
  ) then
    raise exception 'whitelabel_version_promotion_requires_passed_post_update_verification';
  end if;

  if exists (
    select 1 from public.whitelabel_rollout_entitlement
    where rollout_id = v_attempt.rollout_id and status <> 'verified'
  ) then
    raise exception 'whitelabel_version_promotion_entitlements_unverified';
  end if;

  select coalesce(max(ordinal), 0) + 1 into v_ordinal
  from public.whitelabel_installation_version
  where installation_id = p_installation_id;

  insert into public.whitelabel_installation_version (
    installation_id, build_id, ordinal, source_sha, schema_release,
    deployment_url, deployment_ref, origin_kind, update_attempt_id,
    promoted_by, safe_metadata
  ) values (
    p_installation_id, p_build_id, v_ordinal, v_release.source_sha,
    v_release.schema_release, v_attempt.target_deployment_url,
    v_attempt.target_deployment_ref, 'update', p_update_attempt_id,
    p_actor_id, jsonb_build_object('releaseId', v_release.id, 'rolloutId', v_attempt.rollout_id)
  ) returning id into v_version_id;

  update public.whitelabel_installation
  set current_version_id = v_version_id
  where id = p_installation_id and build_id = p_build_id;

  update public.whitelabel_update_attempt
  set status = 'succeeded', completed_at = now(), last_error = null
  where id = p_update_attempt_id and build_id = p_build_id;

  update public.whitelabel_rollout
  set status = 'succeeded', completed_at = now(), last_error = null
  where id = v_attempt.rollout_id and build_id = p_build_id;

  return v_version_id;
end;
$$;

-- Recovery is app-forward: redeploy the prior source against the schema that
-- already exists. The database is never rewound here, so newer customer rows
-- are preserved in place. This RPC atomically records that proof before moving
-- the installed-version pointer to the recovery ledger entry.
create or replace function public.record_whitelabel_recovery_version(
  p_build_id uuid,
  p_installation_id uuid,
  p_recovery_run_id uuid,
  p_actor_id uuid,
  p_source_sha text,
  p_schema_release text,
  p_deployment_ref text,
  p_deployment_url text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recovery public.whitelabel_recovery_run%rowtype;
  v_attempt public.whitelabel_update_attempt%rowtype;
  v_prior public.whitelabel_installation_version%rowtype;
  v_installation public.whitelabel_installation%rowtype;
  v_existing_version_id uuid;
  v_version_id uuid;
  v_ordinal integer;
begin
  select * into v_recovery
  from public.whitelabel_recovery_run
  where id = p_recovery_run_id
    and build_id = p_build_id
    and installation_id = p_installation_id
  for update;
  if not found then
    raise exception 'whitelabel_recovery_run_not_found';
  end if;

  select id into v_existing_version_id
  from public.whitelabel_installation_version
  where recovery_run_id = p_recovery_run_id;
  if v_recovery.status = 'succeeded' and v_existing_version_id is not null then
    return v_existing_version_id;
  end if;
  if v_recovery.status <> 'running' then
    raise exception 'whitelabel_recovery_version_requires_running_recovery';
  end if;
  if v_recovery.database_recovery_mode <> 'forward_fix'
     or not v_recovery.newer_records_preserved then
    raise exception 'whitelabel_app_forward_recovery_mode_required';
  end if;
  if p_deployment_ref is null or btrim(p_deployment_ref) = ''
     or p_deployment_url !~ '^https://'
     or p_schema_release is null
     or btrim(p_schema_release) = '' then
    raise exception 'whitelabel_recovery_deployment_required';
  end if;

  select * into v_attempt
  from public.whitelabel_update_attempt
  where id = v_recovery.update_attempt_id
    and build_id = p_build_id
    and installation_id = p_installation_id
  for update;
  if not found or v_attempt.status <> 'recovery_required' then
    raise exception 'whitelabel_recovery_attempt_not_required';
  end if;
  select * into v_installation
  from public.whitelabel_installation
  where id = p_installation_id and build_id = p_build_id
  for update;
  if not found or v_installation.current_version_id <> v_attempt.from_version_id then
    raise exception 'whitelabel_recovery_current_version_drift';
  end if;
  select * into v_prior
  from public.whitelabel_installation_version
  where id = v_attempt.from_version_id
    and build_id = v_attempt.build_id
    and installation_id = v_attempt.installation_id;
  if not found or v_prior.source_sha <> p_source_sha then
    raise exception 'whitelabel_recovery_source_mismatch';
  end if;

  update public.whitelabel_recovery_run
  set status = 'succeeded',
      deployment_ref = p_deployment_ref,
      deployment_url = p_deployment_url,
      newer_records_preserved = true,
      preservation_evidence = jsonb_build_object(
        'strategy', 'database-left-in-place',
        'boundary', 'forward-schema-preserved',
        'forwardSchemaRelease', p_schema_release
      ),
      completed_at = now(),
      last_error = null
  where id = p_recovery_run_id;

  select coalesce(max(ordinal), 0) + 1 into v_ordinal
  from public.whitelabel_installation_version
  where installation_id = p_installation_id;

  select id into v_existing_version_id
  from public.whitelabel_installation_version
  where installation_id = p_installation_id
    and source_sha = p_source_sha
    and schema_release = p_schema_release
  limit 1;

  if v_existing_version_id is not null then
    v_version_id := v_existing_version_id;
  else
    insert into public.whitelabel_installation_version (
      installation_id, build_id, ordinal, source_sha, schema_release,
      deployment_url, deployment_ref, origin_kind, recovery_run_id,
      promoted_by, safe_metadata
    ) values (
      p_installation_id, p_build_id, v_ordinal,
      p_source_sha, p_schema_release, p_deployment_url, p_deployment_ref,
      'recovery', p_recovery_run_id, p_actor_id,
      jsonb_build_object('updateAttemptId', v_attempt.id, 'databaseStrategy', 'forward_fix')
    ) returning id into v_version_id;
  end if;

  update public.whitelabel_installation
  set current_version_id = v_version_id
  where id = p_installation_id
    and build_id = p_build_id
    and current_version_id is distinct from v_version_id;

  update public.whitelabel_update_attempt
  set status = 'recovered', completed_at = now(), last_error = null
  where id = v_attempt.id and build_id = p_build_id;

  update public.whitelabel_rollout
  set status = 'recovered', completed_at = now(), last_error = null
  where id = v_attempt.rollout_id and build_id = p_build_id;

  return v_version_id;
end;
$$;

-- Keep all lifecycle RPCs private to server-side admin/service-role callers.
revoke all on function public.bootstrap_whitelabel_installation_lifecycle(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.sync_whitelabel_installation_entitlements(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.transition_whitelabel_maintenance_status(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.enter_whitelabel_independent_operation(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.begin_whitelabel_rejoin(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_whitelabel_rejoin(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.start_whitelabel_operational_verification(uuid, uuid, text, uuid, text, text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.finalize_whitelabel_operational_verification(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.promote_whitelabel_installed_version(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.record_whitelabel_recovery_version(uuid, uuid, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.bootstrap_whitelabel_installation_lifecycle(uuid, uuid, uuid) to service_role;
grant execute on function public.sync_whitelabel_installation_entitlements(uuid, uuid, uuid) to service_role;
grant execute on function public.transition_whitelabel_maintenance_status(uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.enter_whitelabel_independent_operation(uuid, uuid, uuid, text) to service_role;
grant execute on function public.begin_whitelabel_rejoin(uuid, uuid, uuid) to service_role;
grant execute on function public.complete_whitelabel_rejoin(uuid, uuid, uuid) to service_role;
grant execute on function public.start_whitelabel_operational_verification(uuid, uuid, text, uuid, text, text, text, uuid, jsonb) to service_role;
grant execute on function public.finalize_whitelabel_operational_verification(uuid, uuid, uuid) to service_role;
grant execute on function public.promote_whitelabel_installed_version(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.record_whitelabel_recovery_version(uuid, uuid, uuid, uuid, text, text, text, text) to service_role;
