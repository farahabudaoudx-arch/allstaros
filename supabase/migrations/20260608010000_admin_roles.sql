-- Admin + Super Admin roles.
-- Two role flags above is_owner: is_admin (CEO + EA, business operations) and
-- is_super_admin (owner/dev, system levers). can_view() is extended so any admin
-- reads org-wide, exactly like an owner — every can_view-based read policy
-- (lead_purchases, producer_goal, recruit, message, ...) inherits this for free.

alter table person add column if not exists is_admin boolean not null default false;
alter table person add column if not exists is_super_admin boolean not null default false;

-- Current user is a business admin: admin OR super_admin OR owner all get org-wide read.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from person
    where id = auth_person_id()
      and (is_admin or is_super_admin or is_owner)
  );
$$;

-- Current user holds the reserved system tier (minting, hard deletes, audit, system config).
create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from person where id = auth_person_id() and is_super_admin
  );
$$;

-- Extend can_view: admins (incl. owners) see everyone; everyone else sees self + downline.
-- This subsumes the owner-only branch from 20260601000100_owner_visibility.sql.
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
    is_admin()
    or target_person in (select id from downline);
$$;

grant execute on function is_admin() to authenticated;
grant execute on function is_super_admin() to authenticated;

-- Seed: the owner account is also super_admin + admin. Idempotent on email.
update person
  set is_super_admin = true,
      is_admin = true
  where lower(email) = lower('nicholasverge@gmail.com');
