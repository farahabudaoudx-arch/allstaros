-- Owner god-mode visibility.
-- Adds an org-owner flag and lets can_view() bypass the downline rule for owners,
-- so a CEO/owner account sees every person and recruit regardless of tree position.

alter table person add column if not exists is_owner boolean not null default false;

-- can_view: an owner sees everyone; everyone else sees self + downline (unchanged).
-- can_view_recruit already delegates to can_view, so it inherits the bypass.
create or replace function can_view(target_person uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive downline as (
    select id from person where id = auth_person_id()
    union all
    select p.id
    from person p
    join downline d on p.upline_id = d.id
  )
  select
    exists (select 1 from person where id = auth_person_id() and is_owner)
    or target_person in (select id from downline);
$$;

-- Seed the owner account. Idempotent on email.
-- linkPersonByEmail() wires the Supabase auth user to this row on first sign-in.
insert into person (full_name, email, is_builder, is_owner, upline_id)
values ('Nicholas Verge', 'nicholasverge@gmail.com', true, true, null)
on conflict (lower(email)) do update
  set is_builder = true,
      is_owner = true;
