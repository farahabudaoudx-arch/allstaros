-- Whitelabel OS Assembly Line: Ticket 5 verification + handoff control plane.
--
-- This migration is intentionally CONTROL-PLANE ONLY. It must never be added to
-- the clean customer migration manifest. Customer installations remain fully
-- operable without these tables.

alter table public.whitelabel_build_addition
  add column if not exists delivery_phase text not null default 'launch'
    check (delivery_phase in ('launch', 'post_handoff'));

create table if not exists public.whitelabel_verification_run (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.whitelabel_build(id) on delete cascade,
  provisioning_run_id uuid not null,
  kind text not null default 'handoff' check (kind in ('handoff', 'post_update', 'compatibility')),
  source_sha text not null check (char_length(btrim(source_sha)) between 7 and 64),
  schema_release text not null check (char_length(btrim(schema_release)) between 1 and 160),
  deployment_url text not null check (deployment_url ~ '^https://'),
  status text not null default 'running' check (status in ('draft', 'running', 'blocked', 'passed')),
  started_by uuid references public.person(id) on delete set null,
  completed_by uuid references public.person(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, build_id)
);

alter table public.whitelabel_provisioning_run
  add constraint whitelabel_provisioning_run_id_build_unique unique (id, build_id);
alter table public.whitelabel_build_addition
  add constraint whitelabel_build_addition_id_build_unique unique (id, build_id);
alter table public.whitelabel_verification_run
  add constraint whitelabel_verification_run_provisioning_build_fk
  foreign key (provisioning_run_id, build_id)
  references public.whitelabel_provisioning_run(id, build_id) on delete restrict;

create unique index if not exists whitelabel_verification_one_active_build_idx
  on public.whitelabel_verification_run (build_id)
  where status in ('draft', 'running', 'blocked');
create index if not exists whitelabel_verification_build_created_idx
  on public.whitelabel_verification_run (build_id, created_at desc, id desc);

drop trigger if exists whitelabel_verification_run_updated_at on public.whitelabel_verification_run;
create trigger whitelabel_verification_run_updated_at
  before update on public.whitelabel_verification_run
  for each row execute function public.set_updated_at();

create table if not exists public.whitelabel_verification_item (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  build_id uuid not null references public.whitelabel_build(id) on delete cascade,
  check_key text not null check (char_length(btrim(check_key)) between 1 and 160),
  label text not null check (char_length(btrim(label)) between 1 and 240),
  category text not null check (category in ('access', 'auth', 'branding', 'business_flow', 'integration', 'scope', 'support', 'operations')),
  mode text not null check (mode in ('automated', 'manual')),
  source_kind text not null default 'base' check (source_kind in ('base', 'addition')),
  addition_id uuid,
  required_for_handoff boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'passed', 'failed', 'deferred', 'not_applicable')),
  expected_summary text,
  actual_summary text,
  evidence jsonb not null default '{}'::jsonb,
  checked_by uuid references public.person(id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, check_key),
  check (source_kind = 'addition' or addition_id is null),
  check (not required_for_handoff or status <> 'deferred'),
  foreign key (run_id, build_id)
    references public.whitelabel_verification_run(id, build_id) on delete cascade,
  foreign key (addition_id, build_id)
    references public.whitelabel_build_addition(id, build_id) on delete restrict
);

create index if not exists whitelabel_verification_item_run_idx
  on public.whitelabel_verification_item (run_id, required_for_handoff desc, category, check_key);

drop trigger if exists whitelabel_verification_item_updated_at on public.whitelabel_verification_item;
create trigger whitelabel_verification_item_updated_at
  before update on public.whitelabel_verification_item
  for each row execute function public.set_updated_at();

create or replace function public.whitelabel_add_business_days(p_start date, p_days integer)
returns date
language plpgsql
immutable
as $$
declare
  v_date date := p_start;
  v_added integer := 0;
begin
  if p_days < 0 then
    raise exception 'business_days_must_be_nonnegative';
  end if;
  while v_added < p_days loop
    v_date := v_date + 1;
    if extract(isodow from v_date) between 1 and 5 then
      v_added := v_added + 1;
    end if;
  end loop;
  return v_date;
end;
$$;

create table if not exists public.whitelabel_handoff (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null unique references public.whitelabel_build(id) on delete restrict,
  verification_run_id uuid not null unique,
  provisioning_run_id uuid not null,
  status text not null default 'preparing' check (status in ('preparing', 'delivered')),
  handoff_at timestamptz,
  review_deadline date,
  defect_deadline date,
  installed_source_sha text not null check (char_length(btrim(installed_source_sha)) between 7 and 64),
  schema_release text not null check (char_length(btrim(schema_release)) between 1 and 160),
  os_url text not null check (os_url ~ '^https://'),
  vercel_project_ref text not null,
  supabase_project_ref text not null,
  initial_admin_email text not null,
  maintenance_status text not null check (maintenance_status in ('selected', 'declined')),
  maintenance_price_cents integer check (maintenance_price_cents is null or maintenance_price_cents >= 0),
  safe_config_snapshot jsonb not null default '{}'::jsonb,
  recorded_by uuid references public.person(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, build_id),
  check (
    (maintenance_status = 'selected' and maintenance_price_cents = 19700)
    or (maintenance_status = 'declined' and maintenance_price_cents is null)
  ),
  check (
    (status = 'preparing' and handoff_at is null and review_deadline is null and defect_deadline is null)
    or (status = 'delivered' and handoff_at is not null and review_deadline is not null and defect_deadline is not null)
  ),
  foreign key (verification_run_id, build_id)
    references public.whitelabel_verification_run(id, build_id) on delete restrict,
  foreign key (provisioning_run_id, build_id)
    references public.whitelabel_provisioning_run(id, build_id) on delete restrict
);

create table if not exists public.whitelabel_handoff_artifact (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null,
  build_id uuid not null references public.whitelabel_build(id) on delete cascade,
  kind text not null check (kind in ('handoff_pdf', 'source_package', 'manifest')),
  revision integer not null default 1 check (revision >= 1),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size >= 0),
  content_type text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.person(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (handoff_id, kind, revision),
  foreign key (handoff_id, build_id)
    references public.whitelabel_handoff(id, build_id) on delete cascade
);

insert into storage.buckets (id, name, public)
values ('whitelabel-handoff-artifacts', 'whitelabel-handoff-artifacts', false)
on conflict (id) do update set public = false;

alter table public.whitelabel_verification_run enable row level security;
alter table public.whitelabel_verification_item enable row level security;
alter table public.whitelabel_handoff enable row level security;
alter table public.whitelabel_handoff_artifact enable row level security;

revoke all on table public.whitelabel_verification_run from anon, authenticated;
revoke all on table public.whitelabel_verification_item from anon, authenticated;
revoke all on table public.whitelabel_handoff from anon, authenticated;
revoke all on table public.whitelabel_handoff_artifact from anon, authenticated;
grant select, insert, update, delete on table public.whitelabel_verification_run to service_role;
grant select, insert, update, delete on table public.whitelabel_verification_item to service_role;
grant select, insert, update on table public.whitelabel_handoff to service_role;
grant select, insert, update, delete on table public.whitelabel_handoff_artifact to service_role;

-- Handoff support windows are contractual history. Once recorded, these fields
-- cannot be reset by regenerating documents or replacing artifacts.
create or replace function public.prevent_whitelabel_handoff_window_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.build_id is distinct from old.build_id
     or new.verification_run_id is distinct from old.verification_run_id then
    raise exception 'whitelabel_handoff_windows_are_immutable';
  end if;
  if old.status = 'delivered' and (
    new.status is distinct from old.status
    or new.handoff_at is distinct from old.handoff_at
    or new.review_deadline is distinct from old.review_deadline
    or new.defect_deadline is distinct from old.defect_deadline
  ) then
    raise exception 'whitelabel_handoff_windows_are_immutable';
  end if;
  if old.status = 'preparing' and new.status = 'delivered' then
    if new.handoff_at is null or new.review_deadline is null or new.defect_deadline is null then
      raise exception 'whitelabel_handoff_delivery_windows_required';
    end if;
  elsif old.status = 'preparing' and (
    new.handoff_at is not null or new.review_deadline is not null or new.defect_deadline is not null
  ) then
    raise exception 'whitelabel_handoff_windows_start_on_delivery';
  end if;
  return new;
end;
$$;

drop trigger if exists whitelabel_handoff_immutable_windows on public.whitelabel_handoff;
create trigger whitelabel_handoff_immutable_windows
  before update on public.whitelabel_handoff
  for each row execute function public.prevent_whitelabel_handoff_window_mutation();

-- Once a canonical handoff exists, its verification evidence is historical
-- evidence. It cannot be rewritten, deleted, or replaced by a second handoff
-- verification run for the same build.
create or replace function public.prevent_whitelabel_handoff_verification_mutation()
returns trigger
language plpgsql
as $$
declare
  v_build_id uuid;
  v_run_id uuid;
  v_kind text;
begin
  if tg_table_name = 'whitelabel_verification_run' then
    v_build_id := coalesce(new.build_id, old.build_id);
    v_run_id := coalesce(new.id, old.id);
    v_kind := coalesce(new.kind, old.kind);
    if tg_op = 'INSERT' then
      if v_kind = 'handoff' and exists (
        select 1 from public.whitelabel_handoff h where h.build_id = v_build_id
      ) then
        raise exception 'whitelabel_handoff_verification_is_immutable';
      end if;
      return new;
    end if;
  else
    v_build_id := coalesce(new.build_id, old.build_id);
    v_run_id := coalesce(new.run_id, old.run_id);
  end if;

  if exists (
    select 1 from public.whitelabel_handoff h
    where h.build_id = v_build_id and h.verification_run_id = v_run_id
  ) then
    raise exception 'whitelabel_handoff_verification_is_immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists whitelabel_verification_run_immutable_after_handoff on public.whitelabel_verification_run;
create trigger whitelabel_verification_run_immutable_after_handoff
  before insert or update or delete on public.whitelabel_verification_run
  for each row execute function public.prevent_whitelabel_handoff_verification_mutation();

drop trigger if exists whitelabel_verification_item_immutable_after_handoff on public.whitelabel_verification_item;
create trigger whitelabel_verification_item_immutable_after_handoff
  before insert or update or delete on public.whitelabel_verification_item
  for each row execute function public.prevent_whitelabel_handoff_verification_mutation();

create or replace function public.start_whitelabel_handoff_verification(
  p_build_id uuid,
  p_provisioning_run_id uuid,
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
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'verification_items_must_be_array';
  end if;

  if exists (select 1 from public.whitelabel_handoff h where h.build_id = p_build_id) then
    raise exception 'whitelabel_handoff_verification_is_immutable';
  end if;

  if not exists (
    select 1
    from public.whitelabel_provisioning_run p
    where p.id = p_provisioning_run_id
      and p.build_id = p_build_id
      and p.status = 'succeeded'
      and p.source_sha = p_source_sha
      and p.deployment_url = p_deployment_url
  ) then
    raise exception 'verification_requires_matching_succeeded_provisioning';
  end if;

  insert into public.whitelabel_verification_run (
    build_id, provisioning_run_id, kind, source_sha, schema_release,
    deployment_url, status, started_by
  ) values (
    p_build_id, p_provisioning_run_id, 'handoff', p_source_sha, p_schema_release,
    p_deployment_url, 'running', p_started_by
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

  return v_run_id;
end;
$$;

create or replace function public.finalize_whitelabel_verification(
  p_build_id uuid,
  p_run_id uuid,
  p_actor_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not exists (
    select 1 from public.whitelabel_verification_run
    where id = p_run_id and build_id = p_build_id and kind = 'handoff'
  ) then
    raise exception 'verification_run_not_found';
  end if;

  if exists (
    select 1 from public.whitelabel_verification_item
    where run_id = p_run_id
      and required_for_handoff
      and status <> 'passed'
  ) then
    v_status := 'blocked';
    update public.whitelabel_verification_run
      set status = v_status, completed_by = null, completed_at = null
      where id = p_run_id and build_id = p_build_id;
  else
    v_status := 'passed';
    update public.whitelabel_verification_run
      set status = v_status, completed_by = p_actor_id, completed_at = now()
      where id = p_run_id and build_id = p_build_id;
  end if;
  return v_status;
end;
$$;

create or replace function public.record_whitelabel_handoff(
  p_build_id uuid,
  p_verification_run_id uuid,
  p_recorded_by uuid,
  p_vercel_project_ref text,
  p_supabase_project_ref text,
  p_initial_admin_email text,
  p_maintenance_status text,
  p_safe_config_snapshot jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.whitelabel_verification_run%rowtype;
  v_provision public.whitelabel_provisioning_run%rowtype;
  v_build public.whitelabel_build%rowtype;
  v_handoff_id uuid;
begin
  select * into v_run
  from public.whitelabel_verification_run
  where id = p_verification_run_id and build_id = p_build_id and kind = 'handoff';
  if not found or v_run.status <> 'passed' then
    raise exception 'handoff_requires_passed_verification';
  end if;

  if exists (
    select 1 from public.whitelabel_verification_item
    where run_id = v_run.id and required_for_handoff and status <> 'passed'
  ) then
    raise exception 'handoff_has_unpassed_required_checks';
  end if;

  select * into v_provision
  from public.whitelabel_provisioning_run
  where id = v_run.provisioning_run_id and build_id = p_build_id;
  if not found or v_provision.status <> 'succeeded'
     or v_provision.source_sha <> v_run.source_sha
     or v_provision.deployment_url <> v_run.deployment_url then
    raise exception 'handoff_source_no_longer_matches_verified_installation';
  end if;

  select * into v_build
  from public.whitelabel_build
  where id = p_build_id;
  if not found or btrim(v_build.domain) = '' then
    raise exception 'handoff_customer_domain_required';
  end if;

  if p_initial_admin_email <> v_build.initial_admin_email then
    raise exception 'handoff_initial_admin_mismatch';
  end if;
  if p_maintenance_status <> v_build.maintenance_status then
    raise exception 'handoff_maintenance_mismatch';
  end if;
  if not exists (
    select 1 from public.whitelabel_service_connection s
    where s.build_id = p_build_id and s.service_kind = 'vercel'
      and s.status = 'verified' and s.project_ref = p_vercel_project_ref
  ) then
    raise exception 'handoff_vercel_project_mismatch';
  end if;
  if not exists (
    select 1 from public.whitelabel_service_connection s
    where s.build_id = p_build_id and s.service_kind = 'supabase'
      and s.status = 'verified' and s.project_ref = p_supabase_project_ref
  ) then
    raise exception 'handoff_supabase_project_mismatch';
  end if;

  if exists (
    select 1 from public.whitelabel_build_addition a
    where a.build_id = p_build_id and a.delivery_phase = 'launch' and a.status <> 'ready'
  ) then
    raise exception 'handoff_launch_additions_not_ready';
  end if;

  if p_maintenance_status not in ('selected', 'declined') then
    raise exception 'handoff_maintenance_decision_required';
  end if;

  insert into public.whitelabel_handoff (
    build_id, verification_run_id, provisioning_run_id,
    status,
    installed_source_sha, schema_release, os_url,
    vercel_project_ref, supabase_project_ref, initial_admin_email,
    maintenance_status, maintenance_price_cents, safe_config_snapshot, recorded_by
  ) values (
    p_build_id, v_run.id, v_provision.id,
    'preparing',
    v_run.source_sha, v_run.schema_release, 'https://' || btrim(v_build.domain),
    p_vercel_project_ref, p_supabase_project_ref, p_initial_admin_email,
    p_maintenance_status,
    case when p_maintenance_status = 'selected' then 19700 else null end,
    coalesce(p_safe_config_snapshot, '{}'::jsonb), p_recorded_by
  ) returning id into v_handoff_id;

  return v_handoff_id;
end;
$$;

create or replace function public.finalize_whitelabel_handoff(
  p_build_id uuid,
  p_handoff_id uuid,
  p_actor_id uuid
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handoff public.whitelabel_handoff%rowtype;
  v_delivered_at timestamptz := now();
begin
  select * into v_handoff
  from public.whitelabel_handoff
  where id = p_handoff_id and build_id = p_build_id
  for update;
  if not found then
    raise exception 'whitelabel_handoff_not_found';
  end if;
  if v_handoff.status = 'delivered' then
    return v_handoff.handoff_at;
  end if;

  if not exists (
    select 1 from public.whitelabel_handoff_artifact a
    where a.handoff_id = v_handoff.id
      and a.build_id = p_build_id
      and a.kind = 'handoff_pdf'
      and a.safe_metadata->>'generated' = 'true'
      and a.safe_metadata->>'sourceSha' = v_handoff.installed_source_sha
      and a.safe_metadata->>'schemaRelease' = v_handoff.schema_release
  ) then
    raise exception 'whitelabel_handoff_pdf_required';
  end if;
  if not exists (
    select 1 from public.whitelabel_handoff_artifact a
    where a.handoff_id = v_handoff.id
      and a.build_id = p_build_id
      and a.kind = 'manifest'
      and a.safe_metadata->>'generated' = 'true'
      and a.safe_metadata->>'sourceSha' = v_handoff.installed_source_sha
      and a.safe_metadata->>'schemaRelease' = v_handoff.schema_release
  ) then
    raise exception 'whitelabel_handoff_manifest_required';
  end if;
  if not exists (
    select 1 from public.whitelabel_handoff_artifact a
    where a.handoff_id = v_handoff.id
      and a.build_id = p_build_id
      and a.kind = 'source_package'
      and a.safe_metadata->>'sourceSha' = v_handoff.installed_source_sha
      and a.safe_metadata->>'schemaRelease' = v_handoff.schema_release
      and a.safe_metadata->>'secretScan' = 'passed'
      and a.safe_metadata->>'controlPlaneExcluded' = 'true'
  ) then
    raise exception 'whitelabel_handoff_source_package_required';
  end if;

  update public.whitelabel_handoff
  set status = 'delivered',
      handoff_at = v_delivered_at,
      review_deadline = public.whitelabel_add_business_days(v_delivered_at::date, 5),
      defect_deadline = v_delivered_at::date + 90,
      recorded_by = coalesce(recorded_by, p_actor_id)
  where id = v_handoff.id and build_id = p_build_id;

  return v_delivered_at;
end;
$$;

revoke all on function public.start_whitelabel_handoff_verification(uuid, uuid, text, text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.finalize_whitelabel_verification(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.record_whitelabel_handoff(uuid, uuid, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.finalize_whitelabel_handoff(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.start_whitelabel_handoff_verification(uuid, uuid, text, text, text, uuid, jsonb) to service_role;
grant execute on function public.finalize_whitelabel_verification(uuid, uuid, uuid) to service_role;
grant execute on function public.record_whitelabel_handoff(uuid, uuid, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.finalize_whitelabel_handoff(uuid, uuid, uuid) to service_role;
