-- Whitelabel Ticket 4: customer-local content/service bindings.
--
-- This migration is intentionally seed-free. A customer installation starts
-- with empty training libraries; provider bindings are written by provisioning.

alter table public.training_content
  drop constraint if exists training_content_library_check;

alter table public.training_content
  add constraint training_content_library_check
  check (
    library in (
      'recruit',
      'live',
      'bootcamp',
      'accelerator',
      'uplevel',
      'all-star-tv',
      'live-dials',
      'case-studies'
    )
  );

create table if not exists public.installation_service_binding (
  service_kind text primary key check (service_kind in ('video', 'ai')),
  provider_key text not null check (provider_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  status text not null default 'configured'
    check (status in ('configured', 'missing', 'failed', 'not_required')),
  account_ref text,
  configuration jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists installation_service_binding_updated_at
  on public.installation_service_binding;
create trigger installation_service_binding_updated_at
  before update on public.installation_service_binding
  for each row execute function public.set_updated_at();

alter table public.installation_service_binding enable row level security;
revoke all on table public.installation_service_binding from anon, authenticated;
grant select, insert, update, delete on table public.installation_service_binding to service_role;

-- The same migration is part of the clean customer schema. Assembly-line
-- control-plane tables are deliberately absent from customer projects, so only
-- apply these control-plane constraints when that table exists.
do $$
begin
  if to_regclass('public.whitelabel_service_connection') is not null then
    alter table public.whitelabel_service_connection
      add column if not exists configuration jsonb not null default '{}'::jsonb;

    alter table public.whitelabel_service_connection
      drop constraint if exists whitelabel_content_service_verified_evidence;

    alter table public.whitelabel_service_connection
      add constraint whitelabel_content_service_verified_evidence
      check (
        service_kind not in ('video', 'ai')
        or status <> 'verified'
        or (
          credential_secret_id is not null
          and verification_method = 'provider_api'
          and last_checked_at is not null
        )
      );
  end if;
end $$;
