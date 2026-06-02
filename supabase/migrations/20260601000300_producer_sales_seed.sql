-- Sample producer sales-tracking data so the dashboard chart + analytics view
-- render real numbers. Seeds ~12 weeks of activity for ONE producer.
--
-- Target selection (in order):
--   1. An explicit email, if you uncomment + set v_pid below.
--   2. Otherwise the first signed-in (auth-linked) person — i.e. whoever has
--      actually logged in. This is the account that will view /producer.
--   3. Otherwise the oldest person row.
-- Re-running is safe: it skips if the target already has tracker_entry rows.

do $$
declare
  v_pid uuid;
begin
  -- To pin the seed to a specific account, uncomment and set the email:
  -- select id into v_pid from person where lower(email) = lower('you@example.com');

  if v_pid is null then
    select id into v_pid from person
     where auth_user_id is not null
     order by created_at asc
     limit 1;
  end if;

  if v_pid is null then
    select id into v_pid from person order by created_at asc limit 1;
  end if;

  if v_pid is null then
    raise notice 'No person rows found; skipping producer seed.';
    return;
  end if;

  if exists (select 1 from tracker_entry where person_id = v_pid) then
    raise notice 'Producer seed already present for %, skipping.', v_pid;
    return;
  end if;

  raise notice 'Seeding producer sales data for person %', v_pid;

  -- Leads: ~600 over the last 84 days, spread across states + age bands 50-80.
  insert into sales_lead (person_id, first_name, last_name, state, age, received_at)
  select
    v_pid,
    'Lead',
    g::text,
    (array['TX','FL','CA','GA','NC','OH','PA','AZ','TN','MI','NY','IL','MO','AL','SC','VA','IN','KY','LA','OK'])[(1 + floor(random() * 20))::int],
    (50 + floor(random() * 31))::int,
    now() - (random() * 84 || ' days')::interval
  from generate_series(1, 600) g;

  -- Per-weekday activity totals (Tracker). Powers the funnel + dashboard series.
  insert into tracker_entry (person_id, entry_date, dials, contacts, appointments, presentations, sales)
  select
    v_pid,
    d::date,
    (80 + floor(random() * 70))::int,
    (28 + floor(random() * 30))::int,
    (6 + floor(random() * 10))::int,
    (4 + floor(random() * 7))::int,
    (1 + floor(random() * 3))::int
  from generate_series(current_date - 84, current_date, interval '1 day') d
  where extract(dow from d) not in (0, 6)
  on conflict (person_id, entry_date) do nothing;

  -- Sales: ~45 closed sales tied to random leads.
  insert into sale (
    person_id, lead_id, carrier,
    face_amount_cents, monthly_premium_cents, annual_premium_cents,
    effective_date, created_at
  )
  select
    v_pid,
    l.id,
    (array['Mutual of Omaha','Americo','Foresters','GTL','Aetna','Transamerica','CoreBridge','Royal Neighbors'])[(1 + floor(random() * 8))::int],
    (1000000 + floor(random() * 1500000))::int,
    m.monthly,
    m.monthly * 12,
    (current_date - floor(random() * 84)::int),
    now() - (random() * 84 || ' days')::interval
  from generate_series(1, 45) g
  cross join lateral (
    select id from sales_lead where person_id = v_pid order by random() limit 1
  ) l
  cross join lateral (
    select (4000 + floor(random() * 8000))::int as monthly
  ) m;

  -- Issued policies: ~72% of sales get issued (a few lapse).
  insert into issued_policy (person_id, sale_id, status, issued_at)
  select
    v_pid,
    s.id,
    case when random() < 0.92 then 'issued' else 'lapsed' end,
    s.created_at + (random() * 10 || ' days')::interval
  from sale s
  where s.person_id = v_pid and random() < 0.72;

  -- Deposits: one received deposit per issued policy (the monthly premium).
  insert into deposit (person_id, policy_id, amount_cents, status, received_at)
  select
    v_pid,
    p.id,
    sa.monthly_premium_cents,
    'received',
    p.issued_at + interval '2 days'
  from issued_policy p
  join sale sa on sa.id = p.sale_id
  where p.person_id = v_pid and p.status = 'issued';

  -- Contact attempts: ~1500, spread across weekday business hours 8-19.
  -- Powers the 7x12 contact heatmap on the analytics Performance section.
  insert into contact_attempt (person_id, lead_id, outcome, created_at)
  select
    v_pid,
    l.id,
    (array['connected','voicemail','no_answer','no_answer','connected','callback','wrong_number'])[(1 + floor(random() * 7))::int],
    (current_date - floor(random() * 84)::int)::timestamptz
      + ((8 + floor(random() * 12)) || ' hours')::interval
      + (floor(random() * 60) || ' minutes')::interval
  from generate_series(1, 1500) g
  cross join lateral (
    select id from sales_lead where person_id = v_pid order by random() limit 1
  ) l;

  raise notice 'Producer seed complete for person %', v_pid;
end $$;
