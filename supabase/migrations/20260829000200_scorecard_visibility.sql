-- Ticket #019: Scorecard visibility is stricter than generic can_view().
-- Producer-only viewers may read only their own Producer snapshots. Builders
-- may additionally read their own Builder snapshots and both card types for
-- their full recursive downline. Generic admin/owner org-wide can_view()
-- semantics are intentionally NOT inherited here because no existing
-- Scorecard-specific privileged bypass exists.

create or replace function scorecard_visible_scope()
returns table (person_id uuid, card_type text)
language sql
stable
security definer
set search_path = public
as $$
  with recursive viewer as (
    select id, is_builder, is_producer
    from person
    where id = auth_person_id()
  ), downline as (
    select p.id
    from person p
    join viewer v on p.id = v.id

    union all

    select child.id
    from person child
    join downline parent on child.upline_id = parent.id
  )
  select v.id, 'producer'::text
  from viewer v
  where v.is_producer or v.is_builder

  union all

  select v.id, 'builder'::text
  from viewer v
  where v.is_builder

  union all

  select d.id, card.card_type
  from viewer v
  join downline d on d.id <> v.id
  cross join (values ('producer'::text), ('builder'::text)) as card(card_type)
  where v.is_builder;
$$;

revoke all on function scorecard_visible_scope() from public, anon;
grant execute on function scorecard_visible_scope() to authenticated;

grant select on scorecard_snapshot to authenticated;

drop policy if exists scorecard_snapshot_read_own on scorecard_snapshot;
drop policy if exists scorecard_snapshot_read_visible on scorecard_snapshot;
create policy scorecard_snapshot_read_visible on scorecard_snapshot
  for select to authenticated
  using (
    lifecycle_status in ('final', 'corrected')
    and (person_id, card_type) in (
      select scope.person_id, scope.card_type
      from scorecard_visible_scope() scope
    )
  );
