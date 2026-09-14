-- Whitelabel OS Assembly Line: Ticket 1 intake + account references.
--
-- This migration stores INTERNAL setup-console state only. Customer business
-- records still live in each customer's own Supabase project. Provider
-- credentials/tokens are intentionally NOT stored here; the tables below hold
-- non-secret account/project references and operator-visible status metadata.

create extension if not exists supabase_vault with schema vault;

create table if not exists public.whitelabel_build (
  id uuid primary key default gen_random_uuid(),
  agency_name text not null check (char_length(btrim(agency_name)) between 1 and 160),
  product_name text not null check (char_length(btrim(product_name)) between 1 and 160),
  primary_contact_name text not null default '',
  primary_contact_email text not null default '',
  initial_admin_name text not null default '',
  initial_admin_email text not null default '',
  domain text not null default '',
  timezone text not null default 'America/Chicago',
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid')),
  standard_scope_confirmed boolean not null default false,
  maintenance_status text not null default 'undecided'
    check (maintenance_status in ('undecided', 'selected', 'declined')),
  notes text,
  brand_primary_color text not null default '',
  brand_accent_color text not null default '',
  logo_path text check (logo_path is null or logo_path like id::text || '/%'),
  favicon_path text check (favicon_path is null or favicon_path like id::text || '/%'),
  created_by uuid references public.person(id) on delete set null,
  updated_by uuid references public.person(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whitelabel_build_updated_idx
  on public.whitelabel_build (updated_at desc, id desc);

drop trigger if exists whitelabel_build_updated_at on public.whitelabel_build;
create trigger whitelabel_build_updated_at
  before update on public.whitelabel_build
  for each row execute function public.set_updated_at();

alter table public.whitelabel_build enable row level security;

-- Whitelabel setup is intentionally server-side only. Every page/action first
-- calls requireAdmin(), then uses the service-role client. Browser Supabase
-- sessions (including admin sessions) do not get direct table grants.
revoke all on table public.whitelabel_build from anon, authenticated;
grant select, insert, update, delete on table public.whitelabel_build to service_role;

create table if not exists public.whitelabel_service_connection (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.whitelabel_build(id) on delete cascade,
  service_kind text not null
    check (service_kind in ('vercel', 'supabase', 'email', 'video', 'ai')),
  required boolean not null default true,
  status text not null default 'missing'
    check (
      status in (
        'missing',
        'provided',
        'needs_owner_action',
        'verified',
        'failed',
        'not_required'
      )
    ),
  account_label text,
  provider_name text not null default '',
  account_ref text,
  project_ref text,
  login_email text,
  billing_url text,
  next_action text,
  verification_method text not null default 'manual'
    check (verification_method in ('manual', 'provider_api')),
  credential_secret_id uuid,
  verified_by uuid references public.person(id) on delete set null,
  status_updated_at timestamptz not null default now(),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (build_id, service_kind),
  check (not (required and status = 'not_required')),
  check (service_kind = 'video' or required),
  check (
    status <> 'verified'
    or (
      account_ref is not null
      and btrim(account_ref) <> ''
      and (
        service_kind not in ('vercel', 'supabase')
        or (
           project_ref is not null
           and btrim(project_ref) <> ''
           and verification_method = 'provider_api'
           and credential_secret_id is not null
           and last_checked_at is not null
        )
      )
    )
  )
);

create index if not exists whitelabel_service_build_idx
  on public.whitelabel_service_connection (build_id, service_kind);

drop trigger if exists whitelabel_service_connection_updated_at
  on public.whitelabel_service_connection;
create trigger whitelabel_service_connection_updated_at
  before update on public.whitelabel_service_connection
  for each row execute function public.set_updated_at();

alter table public.whitelabel_service_connection enable row level security;
revoke all on table public.whitelabel_service_connection from anon, authenticated;
grant select, insert, update, delete on table public.whitelabel_service_connection to service_role;

create table if not exists public.whitelabel_build_addition (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.whitelabel_build(id) on delete cascade,
  addition_type text not null default 'custom_feature'
    check (
      addition_type in (
        'custom_feature',
        'provider_replacement',
        'data_import',
        'bulk_upload',
        'custom_ai',
        'public_website',
        'sms',
        'other'
      )
    ),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  delivery_requirements text not null default '',
  timeline_notes text,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'blocked', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whitelabel_addition_build_idx
  on public.whitelabel_build_addition (build_id, created_at, id);

drop trigger if exists whitelabel_build_addition_updated_at
  on public.whitelabel_build_addition;
create trigger whitelabel_build_addition_updated_at
  before update on public.whitelabel_build_addition
  for each row execute function public.set_updated_at();

alter table public.whitelabel_build_addition enable row level security;
revoke all on table public.whitelabel_build_addition from anon, authenticated;
grant select, insert, update, delete on table public.whitelabel_build_addition to service_role;

-- Seed the standard provider checklist whenever an intake build is created.
-- Video remains optional until the operator marks it required for the build.
create or replace function public.seed_whitelabel_service_connections()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.whitelabel_service_connection (
    build_id,
    service_kind,
    required,
    status,
    provider_name
  )
  values
    (new.id, 'vercel', true, 'missing', 'Vercel'),
    (new.id, 'supabase', true, 'missing', 'Supabase'),
    (new.id, 'email', true, 'missing', ''),
    (new.id, 'video', false, 'not_required', ''),
    (new.id, 'ai', true, 'missing', '')
  on conflict (build_id, service_kind) do nothing;

  return new;
end;
$$;

drop trigger if exists whitelabel_build_seed_services on public.whitelabel_build;
create trigger whitelabel_build_seed_services
  after insert on public.whitelabel_build
  for each row execute function public.seed_whitelabel_service_connections();

revoke all on function public.seed_whitelabel_service_connections() from public, anon, authenticated;

-- Persist verified provider credentials in Supabase Vault, never in ordinary
-- Whitelabel columns. The setup table keeps only the opaque Vault secret UUID.
-- These RPCs are service-role only; admin authorization is enforced by the
-- server action before the service-role client is constructed.
create or replace function public.store_whitelabel_service_credential(
  p_build_id uuid,
  p_service_kind text,
  p_secret text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_secret_name text;
begin
  if p_secret is null or btrim(p_secret) = '' then
    raise exception 'whitelabel_empty_provider_credential';
  end if;

  select credential_secret_id
    into v_secret_id
  from public.whitelabel_service_connection
  where build_id = p_build_id
    and service_kind = p_service_kind
  for update;

  if not found then
    raise exception 'whitelabel_service_not_found';
  end if;

  v_secret_name := 'whitelabel:' || p_build_id::text || ':' || p_service_kind;

  if v_secret_id is null then
    select vault.create_secret(
      p_secret,
      v_secret_name,
      'Verified provider credential for internal Whitelabel OS Assembly Line provisioning'
    ) into v_secret_id;

    update public.whitelabel_service_connection
    set credential_secret_id = v_secret_id
    where build_id = p_build_id
      and service_kind = p_service_kind;
  else
    perform vault.update_secret(
      v_secret_id,
      p_secret,
      v_secret_name,
      'Verified provider credential for internal Whitelabel OS Assembly Line provisioning'
    );
  end if;

  return v_secret_id;
end;
$$;

revoke all on function public.store_whitelabel_service_credential(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.store_whitelabel_service_credential(uuid, text, text)
  to service_role;

create or replace function public.get_whitelabel_service_credential(
  p_build_id uuid,
  p_service_kind text
)
returns text
language sql
security definer
set search_path = public, vault
stable
as $$
  select ds.decrypted_secret
  from public.whitelabel_service_connection sc
  join vault.decrypted_secrets ds on ds.id = sc.credential_secret_id
  where sc.build_id = p_build_id
    and sc.service_kind = p_service_kind
  limit 1;
$$;

revoke all on function public.get_whitelabel_service_credential(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_whitelabel_service_credential(uuid, text)
  to service_role;

-- Private intake branding bucket. Browser clients receive only short-lived
-- signed read URLs created by an authenticated admin server loader. Uploads use
-- the service role after requireAdmin(); no direct storage object policy exists.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whitelabel-intake',
  'whitelabel-intake',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
