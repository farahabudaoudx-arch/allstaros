-- Whitelabel OS Assembly Line: Ticket 3 clean provisioning control plane.
--
-- Customer application data never lives in these tables. They only persist
-- resumable orchestration state, safe external references, and Vault UUIDs.

alter table public.whitelabel_build
  add column if not exists short_name text not null default '',
  add column if not exists support_email text not null default '',
  add column if not exists reply_to_email text not null default '',
  add column if not exists email_from text not null default '',
  add column if not exists licensing_provider_name text not null default '',
  add column if not exists licensing_code text not null default '',
  add column if not exists licensing_login_url text not null default '',
  add column if not exists licensing_requirements_url text not null default '',
  add column if not exists licensing_application_url text not null default '',
  add column if not exists graduation_policy_count integer not null default 8
    check (graduation_policy_count between 1 and 1000),
  add column if not exists graduation_window_days integer not null default 28
    check (graduation_window_days between 1 and 3650),
  add column if not exists stall_persisted_lapse_days integer not null default 3
    check (stall_persisted_lapse_days between 1 and 365),
  add column if not exists stall_exam_unscheduled_days integer not null default 3
    check (stall_exam_unscheduled_days between 1 and 365),
  add column if not exists stall_no_checkin_days integer not null default 2
    check (stall_no_checkin_days between 1 and 365),
  add column if not exists stall_checkin_lapsed_days integer not null default 2
    check (stall_checkin_lapsed_days between 1 and 365);

alter table public.whitelabel_service_connection
  add constraint whitelabel_email_verified_evidence
  check (
    service_kind <> 'email'
    or status <> 'verified'
    or (
      lower(provider_name) = 'resend'
      and credential_secret_id is not null
      and verification_method = 'provider_api'
      and last_checked_at is not null
    )
  );

create table if not exists public.whitelabel_build_carrier_link (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.whitelabel_build(id) on delete cascade,
  company_key text not null check (char_length(btrim(company_key)) between 1 and 160),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  portal_url text not null check (portal_url ~ '^https://'),
  sort_order integer not null default 0 check (sort_order between -10000 and 10000),
  show_in_resources boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (build_id, company_key, display_name)
);

create index if not exists whitelabel_build_carrier_link_build_idx
  on public.whitelabel_build_carrier_link (build_id, sort_order, display_name, id);

drop trigger if exists whitelabel_build_carrier_link_updated_at on public.whitelabel_build_carrier_link;
create trigger whitelabel_build_carrier_link_updated_at
  before update on public.whitelabel_build_carrier_link
  for each row execute function public.set_updated_at();

alter table public.whitelabel_build_carrier_link enable row level security;
revoke all on table public.whitelabel_build_carrier_link from anon, authenticated;
grant select, insert, update, delete on table public.whitelabel_build_carrier_link to service_role;

create table if not exists public.whitelabel_provisioning_run (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.whitelabel_build(id) on delete cascade,
  source_sha text not null check (char_length(btrim(source_sha)) between 7 and 64),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'blocked', 'failed', 'succeeded', 'cancelled')),
  current_step text,
  deployment_ref text,
  deployment_url text,
  last_error text,
  started_by uuid references public.person(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whitelabel_provisioning_one_active_build_idx
  on public.whitelabel_provisioning_run (build_id)
  where status in ('pending', 'running', 'blocked', 'failed');

create index if not exists whitelabel_provisioning_build_created_idx
  on public.whitelabel_provisioning_run (build_id, created_at desc, id desc);

drop trigger if exists whitelabel_provisioning_run_updated_at on public.whitelabel_provisioning_run;
create trigger whitelabel_provisioning_run_updated_at
  before update on public.whitelabel_provisioning_run
  for each row execute function public.set_updated_at();

create table if not exists public.whitelabel_provisioning_step (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.whitelabel_provisioning_run(id) on delete cascade,
  build_id uuid not null references public.whitelabel_build(id) on delete cascade,
  step_key text not null check (step_key in (
    'validate_intake',
    'verify_provider_access',
    'apply_clean_schema',
    'configure_installation',
    'configure_vercel_environment',
    'deploy_source',
    'configure_domain',
    'create_initial_admin',
    'smoke_check'
  )),
  ordinal integer not null check (ordinal between 1 and 99),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'blocked', 'failed', 'succeeded', 'skipped')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  request_key uuid not null default gen_random_uuid(),
  external_ref text,
  external_url text,
  safe_result jsonb not null default '{}'::jsonb,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, step_key),
  unique (run_id, ordinal),
  unique (request_key)
);

create index if not exists whitelabel_provisioning_step_run_idx
  on public.whitelabel_provisioning_step (run_id, ordinal);

drop trigger if exists whitelabel_provisioning_step_updated_at on public.whitelabel_provisioning_step;
create trigger whitelabel_provisioning_step_updated_at
  before update on public.whitelabel_provisioning_step
  for each row execute function public.set_updated_at();

create table if not exists public.whitelabel_provisioning_secret (
  build_id uuid not null references public.whitelabel_build(id) on delete cascade,
  secret_kind text not null check (secret_kind in ('cron_secret', 'initial_admin_invite_url')),
  vault_secret_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (build_id, secret_kind)
);

drop trigger if exists whitelabel_provisioning_secret_updated_at on public.whitelabel_provisioning_secret;
create trigger whitelabel_provisioning_secret_updated_at
  before update on public.whitelabel_provisioning_secret
  for each row execute function public.set_updated_at();

alter table public.whitelabel_provisioning_run enable row level security;
alter table public.whitelabel_provisioning_step enable row level security;
alter table public.whitelabel_provisioning_secret enable row level security;

revoke all on table public.whitelabel_provisioning_run from anon, authenticated;
revoke all on table public.whitelabel_provisioning_step from anon, authenticated;
revoke all on table public.whitelabel_provisioning_secret from anon, authenticated;
grant select, insert, update, delete on table public.whitelabel_provisioning_run to service_role;
grant select, insert, update, delete on table public.whitelabel_provisioning_step to service_role;
grant select, insert, update, delete on table public.whitelabel_provisioning_secret to service_role;

create or replace function public.store_whitelabel_generated_secret(
  p_build_id uuid,
  p_secret_kind text,
  p_secret text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_name text;
begin
  if p_secret_kind not in ('cron_secret', 'initial_admin_invite_url') then
    raise exception 'whitelabel_unknown_generated_secret_kind';
  end if;
  if p_secret is null or btrim(p_secret) = '' then
    raise exception 'whitelabel_empty_generated_secret';
  end if;

  select vault_secret_id into v_secret_id
  from public.whitelabel_provisioning_secret
  where build_id = p_build_id and secret_kind = p_secret_kind
  for update;

  v_name := 'whitelabel:' || p_build_id::text || ':generated:' || p_secret_kind;
  if v_secret_id is null then
    select vault.create_secret(
      p_secret,
      v_name,
      'Generated Whitelabel provisioning secret; never expose in setup UI or audit logs'
    ) into v_secret_id;

    insert into public.whitelabel_provisioning_secret (build_id, secret_kind, vault_secret_id)
    values (p_build_id, p_secret_kind, v_secret_id)
    on conflict (build_id, secret_kind) do update
      set vault_secret_id = excluded.vault_secret_id;
  else
    perform vault.update_secret(
      v_secret_id,
      p_secret,
      v_name,
      'Generated Whitelabel provisioning secret; never expose in setup UI or audit logs'
    );
  end if;
  return v_secret_id;
end;
$$;

create or replace function public.get_whitelabel_generated_secret(
  p_build_id uuid,
  p_secret_kind text
)
returns text
language sql
security definer
set search_path = public, vault
stable
as $$
  select ds.decrypted_secret
  from public.whitelabel_provisioning_secret ps
  join vault.decrypted_secrets ds on ds.id = ps.vault_secret_id
  where ps.build_id = p_build_id
    and ps.secret_kind = p_secret_kind
  limit 1;
$$;

revoke all on function public.store_whitelabel_generated_secret(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.store_whitelabel_generated_secret(uuid, text, text)
  to service_role;
revoke all on function public.get_whitelabel_generated_secret(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_whitelabel_generated_secret(uuid, text)
  to service_role;
