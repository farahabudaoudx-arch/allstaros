-- NPN tracking on person.
--
-- IMPORTANT: these columns were first applied directly to the production
-- database (outside a migration) and already hold real data (94 people are
-- 'verified'. This migration is a CATCH-UP so the repo can reproduce prod and
-- fresh/local databases match. Every statement is idempotent: run against prod
-- it is a no-op and touches no existing rows.

alter table public.person
  add column if not exists npn text,
  add column if not exists npn_status text not null default 'missing',
  add column if not exists npn_notes text,
  add column if not exists npn_source text,
  add column if not exists npn_verified_at timestamptz,
  add column if not exists npn_verified_by uuid;

-- Allowed values for npn_status.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'person_npn_status_check'
  ) then
    alter table public.person
      add constraint person_npn_status_check
      check (npn_status in (
        'missing', 'submitted', 'pending_license',
        'pending_sale', 'pending_transfer', 'verified'
      ));
  end if;
end $$;

-- Allowed values for npn_source (nullable).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'person_npn_source_check'
  ) then
    alter table public.person
      add constraint person_npn_source_check
      check (npn_source is null or npn_source in (
        'user_entered', 'admin_entered', 'gateway_csv',
        'gateway_manual', 'upline_confirmed', 'pop_up'
      ));
  end if;
end $$;

-- Who verified it (self-referential; clear the pointer if that person is removed).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'person_npn_verified_by_fkey'
  ) then
    alter table public.person
      add constraint person_npn_verified_by_fkey
      foreign key (npn_verified_by) references public.person(id) on delete set null;
  end if;
end $$;
