-- Section 3 — visibility helpers. Used by every RLS policy on pipeline tables.

-- Resolve the Supabase auth user to their person row.
create or replace function auth_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from person where auth_user_id = auth.uid() limit 1;
$$;

-- Returns true if target_person is the current user OR anywhere in their downline.
-- Recursive CTE seeded from the current user's person row, walking down via upline_id.
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
  select target_person in (select id from downline);
$$;

-- Convenience wrapper for tables that key off a recruit row.
create or replace function can_view_recruit(target_recruit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select can_view(r.person_id)
  from recruit r
  where r.id = target_recruit;
$$;

grant execute on function auth_person_id() to authenticated;
grant execute on function can_view(uuid) to authenticated;
grant execute on function can_view_recruit(uuid) to authenticated;
