-- Recruit self-signup via a builder's unique referral link.
--
-- Each builder gets a stable referral code that backs a public signup link
-- (/join/<code>). A recruit who signs up through that link is created with
-- upline_id = the builder, so the whole downline (recruit → producer →
-- builder) stays under that builder via the existing can_view() recursion.
--
-- Two contact fields collected on signup live on the recruit row.

alter table recruit add column if not exists phone text;
alter table recruit add column if not exists state text;

create table if not exists builder_referral (
  builder_id uuid primary key references person(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists builder_referral_code_idx on builder_referral(code);

-- Backfill a stable code for every existing builder. New builders get one
-- lazily (see src/lib/referral.ts getOrCreateReferralCode).
insert into builder_referral (builder_id, code)
select id, substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
from person
where is_builder
on conflict (builder_id) do nothing;

alter table builder_referral enable row level security;

-- A builder may read their own referral code. Public resolution of a code →
-- builder (on the unauthenticated /join page) happens via the service-role
-- client, which bypasses RLS.
drop policy if exists builder_referral_select on builder_referral;
create policy builder_referral_select on builder_referral
  for select to authenticated
  using (builder_id = auth_person_id());
