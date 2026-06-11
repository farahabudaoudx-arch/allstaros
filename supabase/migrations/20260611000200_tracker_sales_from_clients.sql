-- "Policies Sold" on the Daily Tracker is now driven exclusively by Clients.
--
-- Previously tracker_entry.sales was a free +/- counter that drifted from the
-- actual book of business. Now a sale can only be logged by adding a client, and
-- this trigger keeps tracker_entry.sales == (count of that producer's "sale"
-- clients written on that day). Everything downstream (dashboard, analytics,
-- leaderboard, projections) already reads tracker_entry.sales, so this single
-- source of truth keeps them all consistent. The producer can no longer type a
-- sales number directly — the tracker UI shows the count read-only with an
-- "Add New Client" button, and the API no longer writes the sales column.
--
-- The "sold on" day is the policy-written date (submit_date), falling back to the
-- client meeting date when submit_date is absent.

-- Recompute and store the sales count for one producer + one day.
create or replace function sync_tracker_sales(p_person uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt integer;
begin
  if p_person is null or p_date is null then
    return;
  end if;

  select count(*) into cnt
    from clients
   where person_id = p_person
     and sale_status = 'sale'
     and coalesce(submit_date, date) = p_date;

  if cnt > 0 then
    insert into tracker_entry (person_id, entry_date, sales)
    values (p_person, p_date, cnt)
    on conflict (person_id, entry_date)
    do update set sales = excluded.sales, updated_at = now();
  else
    -- No sold clients left on this day: zero the count but keep other activity.
    update tracker_entry
       set sales = 0, updated_at = now()
     where person_id = p_person and entry_date = p_date;
  end if;
end;
$$;

-- Fire on any change to a client that could affect a day's sold count.
create or replace function trg_clients_sync_tracker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform sync_tracker_sales(new.person_id, coalesce(new.submit_date, new.date));
  elsif tg_op = 'UPDATE' then
    perform sync_tracker_sales(new.person_id, coalesce(new.submit_date, new.date));
    -- If the sold day or owner moved, also refresh the old day.
    if coalesce(old.submit_date, old.date) is distinct from coalesce(new.submit_date, new.date)
       or old.person_id is distinct from new.person_id then
      perform sync_tracker_sales(old.person_id, coalesce(old.submit_date, old.date));
    end if;
  elsif tg_op = 'DELETE' then
    perform sync_tracker_sales(old.person_id, coalesce(old.submit_date, old.date));
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_sync_tracker on clients;
create trigger clients_sync_tracker
  after insert or update or delete on clients
  for each row execute function trg_clients_sync_tracker();

-- Backfill: sync every (producer, day) that already has sold clients.
insert into tracker_entry (person_id, entry_date, sales)
select person_id, coalesce(submit_date, date) as d, count(*)
  from clients
 where sale_status = 'sale'
   and coalesce(submit_date, date) is not null
 group by person_id, coalesce(submit_date, date)
on conflict (person_id, entry_date)
do update set sales = excluded.sales, updated_at = now();
