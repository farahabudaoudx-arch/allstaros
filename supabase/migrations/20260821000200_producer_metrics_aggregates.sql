-- Performance: person-scoped dashboard / analytics / calendar aggregates in SQL.
--
-- computeDashboard / computeAnalytics / computeCalendar used to select every
-- clients (and lead_purchases) row for the person, then date-filter in Node.
-- Cost grew with lifetime book size even for "today".
--
-- These SECURITY INVOKER helpers filter by effective sale / issue / purchase day
-- in Postgres (same fallbacks as src/lib/producer/metrics.ts) and return only
-- aggregates (or sparse day buckets). RLS still applies.

-- Effective sale calendar day: submit_date → date → created_at in viewer tz.
create or replace function producer_client_sale_day(
  p_submit_date date,
  p_date date,
  p_created_at timestamptz,
  p_tz text
) returns date
language sql
immutable
as $$
  select coalesce(
    p_submit_date,
    p_date,
    (p_created_at at time zone p_tz)::date
  );
$$;

-- Per-day dashboard buckets (sparse). Caller expands zeros / hourly "today".
create or replace function producer_dashboard_day_buckets(
  p_person_id uuid,
  p_from date,
  p_to date,
  p_tz text
)
returns table (
  bucket_date date,
  leads bigint,
  dials bigint,
  contacts bigint,
  appointments bigint,
  presentations bigint,
  tracker_sales bigint,
  sale_count bigint,
  ap_cents bigint,
  ip_cents bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with tracker as (
    select
      t.entry_date::date as bucket_date,
      coalesce(sum(t.leads), 0)::bigint as leads,
      coalesce(sum(t.dials), 0)::bigint as dials,
      coalesce(sum(t.contacts), 0)::bigint as contacts,
      coalesce(sum(t.appointments), 0)::bigint as appointments,
      coalesce(sum(t.presentations), 0)::bigint as presentations,
      coalesce(sum(t.sales), 0)::bigint as tracker_sales
    from tracker_entry t
    where t.person_id = p_person_id
      and t.entry_date between p_from and p_to
    group by 1
  ),
  sales as (
    select
      producer_client_sale_day(c.submit_date, c."date", c.created_at, p_tz) as bucket_date,
      count(*)::bigint as sale_count,
      coalesce(sum(round(c.annual_premium * 100)), 0)::bigint as ap_cents
    from clients c
    where c.person_id = p_person_id
      and coalesce(c.sale_status, 'sale') = 'sale'
      and producer_client_sale_day(c.submit_date, c."date", c.created_at, p_tz)
          between p_from and p_to
    group by 1
  ),
  issues as (
    select
      c.issue_date as bucket_date,
      coalesce(sum(round(c.annual_premium * 100)), 0)::bigint as ip_cents
    from clients c
    where c.person_id = p_person_id
      and c.issue_date between p_from and p_to
    group by 1
  ),
  days as (
    select bucket_date from tracker
    union
    select bucket_date from sales
    union
    select bucket_date from issues
  )
  select
    d.bucket_date,
    coalesce(t.leads, 0),
    coalesce(t.dials, 0),
    coalesce(t.contacts, 0),
    coalesce(t.appointments, 0),
    coalesce(t.presentations, 0),
    coalesce(t.tracker_sales, 0),
    coalesce(s.sale_count, 0),
    coalesce(s.ap_cents, 0),
    coalesce(i.ip_cents, 0)
  from days d
  left join tracker t on t.bucket_date = d.bucket_date
  left join sales s on s.bucket_date = d.bucket_date
  left join issues i on i.bucket_date = d.bucket_date;
$$;

grant execute on function producer_dashboard_day_buckets(uuid, date, date, text) to authenticated, service_role;

-- Analytics: one jsonb blob with totals + breakdowns (matches JS shape).
create or replace function producer_analytics_bundle(
  p_person_id uuid,
  p_from date,
  p_to date,
  p_tz text
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with sale_rows as (
    select
      c.*,
      producer_client_sale_day(c.submit_date, c."date", c.created_at, p_tz) as sale_day,
      round(coalesce(c.annual_premium, 0) * 100)::bigint as ap_cents,
      upper(trim(coalesce(c.state, ''))) as state_norm,
      case
        when c.age between 50 and 59 then '50–59'
        when c.age between 60 and 64 then '60–64'
        when c.age between 65 and 69 then '65–69'
        when c.age between 70 and 74 then '70–74'
        when c.age between 75 and 80 then '75–80'
        else null
      end as age_band,
      coalesce(
        nullif(trim(c.quotes -> c.chosen_quote_index ->> 'carrier'), ''),
        (
          select nullif(trim(q ->> 'carrier'), '')
          from jsonb_array_elements(coalesce(c.quotes, '[]'::jsonb)) q
          where nullif(trim(q ->> 'carrier'), '') is not null
          limit 1
        ),
        'Other'
      ) as carrier_name,
      round(
        coalesce(
          nullif(regexp_replace(coalesce(c.quotes -> c.chosen_quote_index ->> 'premium', ''), '[^0-9.]', '', 'g'), '')::numeric,
          (
            select nullif(regexp_replace(coalesce(q ->> 'premium', ''), '[^0-9.]', '', 'g'), '')::numeric
            from jsonb_array_elements(coalesce(c.quotes, '[]'::jsonb)) q
            where q ->> 'carrier' is not null
            limit 1
          ),
          0
        ) * 100
      )::bigint as quote_monthly_cents,
      round(
        coalesce(
          nullif(regexp_replace(coalesce(c.quotes -> c.chosen_quote_index ->> 'coverage', ''), '[^0-9.]', '', 'g'), '')::numeric,
          (
            select nullif(regexp_replace(coalesce(q ->> 'coverage', ''), '[^0-9.]', '', 'g'), '')::numeric
            from jsonb_array_elements(coalesce(c.quotes, '[]'::jsonb)) q
            where q ->> 'carrier' is not null
            limit 1
          ),
          0
        ) * 100
      )::bigint as quote_face_cents
    from clients c
    where c.person_id = p_person_id
      and coalesce(c.sale_status, 'sale') = 'sale'
      and producer_client_sale_day(c.submit_date, c."date", c.created_at, p_tz)
          between p_from and p_to
  ),
  issued as (
    select
      count(*)::int as issued_count,
      coalesce(sum(round(coalesce(c.annual_premium, 0) * 100)), 0)::bigint as ip_cents
    from clients c
    where c.person_id = p_person_id
      and c.issue_date between p_from and p_to
  ),
  tracker as (
    select
      coalesce(sum(t.leads), 0)::bigint as leads,
      coalesce(sum(t.dials), 0)::bigint as dials,
      coalesce(sum(t.contacts), 0)::bigint as contacts,
      coalesce(sum(t.appointments), 0)::bigint as appointments,
      coalesce(sum(t.presentations), 0)::bigint as presentations,
      coalesce(sum(t.sales), 0)::bigint as tracker_sales
    from tracker_entry t
    where t.person_id = p_person_id
      and t.entry_date between p_from and p_to
  ),
  deposits as (
    select coalesce(sum(round(d.actual_amount * 100)), 0)::bigint as deposits_cents
    from client_deposits d
    where d.person_id = p_person_id
      and d.status = 'successful'
      and coalesce(
            (d.updated_at at time zone p_tz)::date,
            (d.created_at at time zone p_tz)::date
          ) between p_from and p_to
  ),
  spend as (
    select coalesce(sum(round(p.amount * 100)), 0)::bigint as lead_spend_cents
    from lead_purchases p
    where p.person_id = p_person_id
      and coalesce(
            p.purchase_date,
            (p.created_at at time zone p_tz)::date
          ) between p_from and p_to
  ),
  sale_agg as (
    select
      count(*)::bigint as sale_count,
      coalesce(sum(ap_cents), 0)::bigint as ap_cents
    from sale_rows
  ),
  totals as (
    select jsonb_build_object(
      'leads', (select leads from tracker),
      'dials', (select dials from tracker),
      'contacts', (select contacts from tracker),
      'appointments', (select appointments from tracker),
      'presentations', (select presentations from tracker),
      'sales', greatest((select tracker_sales from tracker), (select sale_count from sale_agg)),
      'ap_cents', (select ap_cents from sale_agg),
      'ip_cents', (select ip_cents from issued),
      'issuedCount', (select issued_count from issued),
      'deposits_cents', (select deposits_cents from deposits),
      'leadSpend_cents', (select lead_spend_cents from spend)
    ) as v
  ),
  state_perf as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'state', state_norm,
          'leads', 0,
          'sales', sales,
          'ap_cents', ap_cents
        )
        order by ap_cents desc, sales desc
      ) filter (where state_norm <> ''),
      '[]'::jsonb
    ) as v
    from (
      select state_norm, count(*)::int as sales, sum(ap_cents)::bigint as ap_cents
      from sale_rows
      where state_norm <> ''
      group by state_norm
      order by sum(ap_cents) desc, count(*) desc
      limit 10
    ) s
  ),
  age_bands as (
    select jsonb_build_array(
      jsonb_build_object('band', '50–59', 'leads', 0, 'sales', coalesce((select count(*) from sale_rows where age_band = '50–59'), 0), 'ap_cents', coalesce((select sum(ap_cents) from sale_rows where age_band = '50–59'), 0)),
      jsonb_build_object('band', '60–64', 'leads', 0, 'sales', coalesce((select count(*) from sale_rows where age_band = '60–64'), 0), 'ap_cents', coalesce((select sum(ap_cents) from sale_rows where age_band = '60–64'), 0)),
      jsonb_build_object('band', '65–69', 'leads', 0, 'sales', coalesce((select count(*) from sale_rows where age_band = '65–69'), 0), 'ap_cents', coalesce((select sum(ap_cents) from sale_rows where age_band = '65–69'), 0)),
      jsonb_build_object('band', '70–74', 'leads', 0, 'sales', coalesce((select count(*) from sale_rows where age_band = '70–74'), 0), 'ap_cents', coalesce((select sum(ap_cents) from sale_rows where age_band = '70–74'), 0)),
      jsonb_build_object('band', '75–80', 'leads', 0, 'sales', coalesce((select count(*) from sale_rows where age_band = '75–80'), 0), 'ap_cents', coalesce((select sum(ap_cents) from sale_rows where age_band = '75–80'), 0))
    ) as v
  ),
  carrier_perf as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', carrier_name,
          'sales', sales,
          'ap_cents', ap_cents,
          'avg_monthly_premium_cents', case when sales > 0 then round(monthly_total::numeric / sales) else 0 end,
          'avg_face_amount_cents', case when sales > 0 then round(face_total::numeric / sales) else 0 end
        )
        order by ap_cents desc
      ),
      '[]'::jsonb
    ) as v
    from (
      select
        carrier_name,
        count(*)::int as sales,
        sum(ap_cents)::bigint as ap_cents,
        sum(quote_monthly_cents)::bigint as monthly_total,
        sum(quote_face_cents)::bigint as face_total
      from sale_rows
      group by carrier_name
    ) c
  )
  select jsonb_build_object(
    'totals', (select v from totals),
    'state_perf', (select v from state_perf),
    'age_bands', (select v from age_bands),
    'carrier_perf', (select v from carrier_perf)
  );
$$;

grant execute on function producer_analytics_bundle(uuid, date, date, text) to authenticated, service_role;

-- Calendar month days (sparse).
create or replace function producer_calendar_days(
  p_person_id uuid,
  p_from date,
  p_to date,
  p_tz text
)
returns table (
  day date,
  ap_cents bigint,
  ip_cents bigint,
  sales integer,
  submitted boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with sales as (
    select
      producer_client_sale_day(c.submit_date, c."date", c.created_at, p_tz) as day,
      count(*)::int as sales,
      coalesce(sum(round(c.annual_premium * 100)), 0)::bigint as ap_cents
    from clients c
    where c.person_id = p_person_id
      and coalesce(c.sale_status, 'sale') = 'sale'
      and producer_client_sale_day(c.submit_date, c."date", c.created_at, p_tz)
          between p_from and p_to
    group by 1
  ),
  issues as (
    select
      c.issue_date as day,
      coalesce(sum(round(c.annual_premium * 100)), 0)::bigint as ip_cents
    from clients c
    where c.person_id = p_person_id
      and c.issue_date between p_from and p_to
    group by 1
  ),
  tracker as (
    select distinct t.entry_date::date as day
    from tracker_entry t
    where t.person_id = p_person_id
      and t.entry_date between p_from and p_to
  ),
  days as (
    select day from sales
    union
    select day from issues
    union
    select day from tracker
  )
  select
    d.day,
    coalesce(s.ap_cents, 0),
    coalesce(i.ip_cents, 0),
    coalesce(s.sales, 0),
    (t.day is not null) as submitted
  from days d
  left join sales s on s.day = d.day
  left join issues i on i.day = d.day
  left join tracker t on t.day = d.day;
$$;

grant execute on function producer_calendar_days(uuid, date, date, text) to authenticated, service_role;
