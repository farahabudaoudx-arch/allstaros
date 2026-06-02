-- Multi-producer sample data so the producer leaderboard has a real ranking to
-- show. The base producer seed (…000300) only fills ONE producer, which renders
-- a single-row board. This spreads differentiated MTD activity across the
-- @example.test cohort (Alice, Bob, Charlie, Daria, Eve, Frank).
--
-- Dev-only + idempotent: it touches ONLY @example.test persons and skips anyone
-- who already has a sale this month, so re-running is safe and it never affects
-- real accounts.

do $$
declare
  r record;
  v_lead uuid;
  v_sale uuid;
  i int;
  v_carriers text[] := array['Mutual of Omaha','Americo','Foresters','GTL','Aetna','Transamerica'];
  v_states   text[] := array['TX','FL','GA','NC','OH','AZ','TN','MI'];
begin
  for r in
    -- (email, sale_count, issue_rate) — tuned so the ranking has clear spread.
    select * from (values
      ('alice@example.test',   18, 0.85),
      ('bob@example.test',     12, 0.80),
      ('charlie@example.test',  9, 0.75),
      ('eve@example.test',      6, 0.70),
      ('daria@example.test',    4, 0.60),
      ('frank@example.test',    2, 0.50)
    ) as t(email, sale_count, issue_rate)
  loop
    declare
      v_pid uuid;
      v_sales int := r.sale_count;
      v_issue numeric := r.issue_rate;
    begin
      select id into v_pid from person where lower(email) = lower(r.email);
      if v_pid is null then
        continue;
      end if;

      -- Skip if this producer already has a sale this month (idempotent).
      if exists (
        select 1 from sale
        where person_id = v_pid
          and created_at >= date_trunc('month', now())
      ) then
        continue;
      end if;

      -- Per-day activity totals for the current month-to-date (weekdays only).
      insert into tracker_entry (person_id, entry_date, dials, contacts, appointments, presentations, sales)
      select
        v_pid,
        d::date,
        (60 + floor(random() * 80))::int,
        (20 + floor(random() * 30))::int,
        (4 + floor(random() * 8))::int,
        (2 + floor(random() * 6))::int,
        (floor(random() * 3))::int
      from generate_series(date_trunc('month', now())::date, current_date, interval '1 day') d
      where extract(dow from d) not in (0, 6)
      on conflict (person_id, entry_date) do nothing;

      -- Closed sales this month, each tied to a fresh lead.
      for i in 1..v_sales loop
        insert into sales_lead (person_id, first_name, last_name, state, age, received_at)
        values (
          v_pid, 'Lead', i::text,
          v_states[(1 + floor(random() * array_length(v_states, 1)))::int],
          (50 + floor(random() * 31))::int,
          date_trunc('month', now()) + (random() * extract(day from now() - date_trunc('month', now())) || ' days')::interval
        )
        returning id into v_lead;

        insert into sale (
          person_id, lead_id, carrier,
          face_amount_cents, monthly_premium_cents, annual_premium_cents,
          effective_date, created_at
        )
        select
          v_pid, v_lead,
          v_carriers[(1 + floor(random() * array_length(v_carriers, 1)))::int],
          (1000000 + floor(random() * 1500000))::int,
          m.monthly, m.monthly * 12,
          current_date - floor(random() * 14)::int,
          date_trunc('month', now()) + (random() * extract(day from now() - date_trunc('month', now())) || ' days')::interval
        from (select (4000 + floor(random() * 8000))::int as monthly) m
        returning id into v_sale;

        -- Issue most sales (per the producer's issue_rate); deposit the premium.
        if random() < v_issue then
          declare v_policy uuid; v_monthly int;
          begin
            select monthly_premium_cents into v_monthly from sale where id = v_sale;
            insert into issued_policy (person_id, sale_id, status, issued_at)
            values (v_pid, v_sale, 'issued', now() - (random() * 5 || ' days')::interval)
            returning id into v_policy;
            insert into deposit (person_id, policy_id, amount_cents, status, received_at)
            values (v_pid, v_policy, v_monthly, 'received', now() - (random() * 3 || ' days')::interval);
          end;
        end if;
      end loop;

      raise notice 'Leaderboard seed: % sales for %', v_sales, r.email;
    end;
  end loop;
end $$;
