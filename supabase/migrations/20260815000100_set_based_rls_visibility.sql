-- Performance: set-based RLS visibility.
--
-- Problem: every hot read policy called can_view(person_id) PER CANDIDATE ROW.
-- can_view() is SECURITY DEFINER with a SET clause, which Postgres cannot
-- inline — so the recursive downline CTE re-ran for every row scanned. On
-- org-wide reads (clients, tracker_entry, client_deposits, ...) that turned
-- a few hundred rows into seconds of CPU per query and, as the book grows,
-- into statement timeouts.
--
-- Fix: compute the visible-person set ONCE per statement.
--
--   1. visible_person_ids() returns exactly the set can_view() decided
--      membership of: admins/owners see everyone; everyone else sees
--      self + their recursive downline.
--   2. Hot read policies become `person_id in (select visible_person_ids())`.
--      The subquery is uncorrelated, so the planner evaluates it once per
--      statement and hashes it; each row check is then a hash probe instead
--      of a recursive tree walk.
--   3. can_view() is redefined to test membership in the same set, so every
--      remaining policy (and can_view_recruit) keeps identical semantics.
--      It is now plain SQL with no SECURITY DEFINER and no SET clause, so the
--      planner may additionally inline it where it is still used.
--
-- Visibility semantics are UNCHANGED: the same rows are visible before and
-- after, for every role (recruit / producer / builder / admin / owner).

-- 1) The visible-person set, computed once per statement.
--    SECURITY DEFINER so the internal person-tree walk is not itself subject
--    to the person RLS policy (which now references this function).
create or replace function visible_person_ids()
returns setof uuid
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
  select id from person where is_admin()
  union
  select id from downline;
$$;

grant execute on function visible_person_ids() to authenticated;

-- 2) Same contract as before, now a membership test against the set.
--    No SECURITY DEFINER / SET clause (both block inlining); the privileged
--    tree walk lives inside visible_person_ids(). Schema-qualified so the
--    body is search_path-safe without a SET clause.
create or replace function can_view(target_person uuid)
returns boolean
language sql
stable
as $$
  select target_person in (select public.visible_person_ids());
$$;

-- 3) Rewrite the hot-path read policies to the explicit set form.
--    Role targets ("to authenticated" vs default) match the originals.

drop policy if exists person_select on person;
create policy person_select on person
  for select to authenticated
  using (id in (select visible_person_ids()));

drop policy if exists recruit_select on recruit;
create policy recruit_select on recruit
  for select to authenticated
  using (person_id in (select visible_person_ids()));

drop policy if exists "clients: read" on clients;
create policy "clients: read" on clients
  for select using (person_id in (select visible_person_ids()));

drop policy if exists "client_deposits: read" on client_deposits;
create policy "client_deposits: read" on client_deposits
  for select using (person_id in (select visible_person_ids()));

drop policy if exists "tracker_entry: read" on tracker_entry;
create policy "tracker_entry: read" on tracker_entry
  for select using (person_id in (select visible_person_ids()));

drop policy if exists "lead_purchases: read" on lead_purchases;
create policy "lead_purchases: read" on lead_purchases
  for select using (person_id in (select visible_person_ids()));

drop policy if exists "producer_issued_premium: read" on producer_issued_premium;
create policy "producer_issued_premium: read" on producer_issued_premium
  for select using (person_id in (select visible_person_ids()));

drop policy if exists "producer_goal: read" on producer_goal;
create policy "producer_goal: read" on producer_goal
  for select using (person_id in (select visible_person_ids()));

drop policy if exists "daily_projection: read" on daily_projection;
create policy "daily_projection: read" on daily_projection
  for select using (person_id in (select visible_person_ids()));
