-- Performance: aggregate leaderboard metrics in SQL instead of shipping rows.
--
-- computeLeaderboard() used to page EVERY visible client / tracker / deposit
-- row over PostgREST (serially, 1000 rows per round trip) and aggregate in JS.
-- Payload grew with the size of the book, not the size of the team — ~3k rows
-- today, unbounded tomorrow. This function does the same aggregation in the
-- database and returns one row per person.
--
-- SECURITY INVOKER: RLS applies exactly as it did to the raw table reads.
--   * authed client  → clipped to the viewer's visible set (team board)
--   * service role   → org-wide (public leaderboard), same as before
--
-- The attribution rules mirror src/lib/producer/metrics.ts exactly:
--   * a client is a sale when coalesce(sale_status,'sale') = 'sale'; it counts
--     on submit_date, falling back to "date", then created_at in the viewer tz
--   * it is an issued policy when issue_date is in range
--   * premiums/amounts are numeric dollars → integer cents
--   * deposits count when successful, on updated_at's day in the viewer tz
--   * a person appears when they have any qualifying sale/issue, any tracker
--     row in range (even all zeros), or any qualifying deposit — matching the
--     JS bump() semantics
create or replace function leaderboard_aggregates(p_from date, p_to date, p_tz text)
returns table (
  person_id uuid,
  full_name text,
  ap_cents bigint,
  ip_cents bigint,
  sale_count integer,
  policies integer,
  deposits_cents bigint,
  tracker_sales integer,
  dials integer,
  contacts integer,
  appointments integer,
  presentations integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with sale_stats as (
    select
      c.person_id,
      count(*) filter (
        where coalesce(c.sale_status, 'sale') = 'sale'
          and coalesce(c.submit_date, c."date", (c.created_at at time zone p_tz)::date)
              between p_from and p_to
      )::int as sale_count,
      coalesce(sum(round(c.annual_premium * 100)) filter (
        where coalesce(c.sale_status, 'sale') = 'sale'
          and coalesce(c.submit_date, c."date", (c.created_at at time zone p_tz)::date)
              between p_from and p_to
      ), 0)::bigint as ap_cents,
      count(*) filter (where c.issue_date between p_from and p_to)::int as policies,
      coalesce(sum(round(c.annual_premium * 100)) filter (
        where c.issue_date between p_from and p_to
      ), 0)::bigint as ip_cents
    from clients c
    group by c.person_id
  ),
  tracker_stats as (
    select
      t.person_id,
      coalesce(sum(t.sales), 0)::int as tracker_sales,
      coalesce(sum(t.dials), 0)::int as dials,
      coalesce(sum(t.contacts), 0)::int as contacts,
      coalesce(sum(t.appointments), 0)::int as appointments,
      coalesce(sum(t.presentations), 0)::int as presentations
    from tracker_entry t
    where t.entry_date between p_from and p_to
    group by t.person_id
  ),
  deposit_stats as (
    select
      d.person_id,
      coalesce(sum(round(d.actual_amount * 100)), 0)::bigint as deposits_cents
    from client_deposits d
    where d.status = 'successful'
      and (d.updated_at at time zone p_tz)::date between p_from and p_to
    group by d.person_id
  ),
  ids as (
    select s.person_id from sale_stats s where s.sale_count > 0 or s.policies > 0
    union
    select t.person_id from tracker_stats t
    union
    select d.person_id from deposit_stats d
  )
  select
    i.person_id,
    coalesce(p.full_name, 'Unknown') as full_name,
    coalesce(s.ap_cents, 0) as ap_cents,
    coalesce(s.ip_cents, 0) as ip_cents,
    coalesce(s.sale_count, 0) as sale_count,
    coalesce(s.policies, 0) as policies,
    coalesce(d.deposits_cents, 0) as deposits_cents,
    coalesce(t.tracker_sales, 0) as tracker_sales,
    coalesce(t.dials, 0) as dials,
    coalesce(t.contacts, 0) as contacts,
    coalesce(t.appointments, 0) as appointments,
    coalesce(t.presentations, 0) as presentations
  from ids i
  left join person p on p.id = i.person_id
  left join sale_stats s on s.person_id = i.person_id
  left join tracker_stats t on t.person_id = i.person_id
  left join deposit_stats d on d.person_id = i.person_id
$$;

grant execute on function leaderboard_aggregates(date, date, text) to authenticated, service_role;

-- The team board and this function scan tracker_entry by date range across the
-- whole visible set; the existing (person_id, entry_date) index can't serve a
-- date-only range, which becomes a full scan as the table grows.
create index if not exists tracker_entry_date_idx on tracker_entry(entry_date);
