-- Run only inside BEGIN + 20260905000100_gateway_runner_hardening.sql + ROLLBACK.
-- Exercises the durable DB contract without leaving a connection, job, import, or premium row.
do $$
declare
  member_id uuid := gen_random_uuid();
  queued_job_id uuid;
  claimed record;
  renewed_until timestamptz;
  result jsonb;
  completed boolean;
  business_date date := (now() at time zone 'America/Chicago')::date;
  stale_token uuid := gen_random_uuid();
  row_payload jsonb := '{"producer":"Durable Runner Acceptance","producerNpn":"999800008","personalIpCents":11100,"teamIpCents":22200,"outsideFirstLegCents":33300}'::jsonb;
begin
  insert into public.person(id, full_name, email, is_producer, status, npn)
  values(member_id, 'Durable Runner Acceptance', 'runner-durable-' || member_id || '@acceptance.invalid', true, 'active', '999800008');

  insert into public.gateway_connection(
    person_id, status, session_ref, session_generation, first_connected_at, connected_at
  ) values (
    member_id, 'connected', 'runner-durable-acceptance', 7, now() - interval '1 day', now()
  );

  queued_job_id := public.enqueue_gateway_report_pull_after_connect(member_id);
  if queued_job_id is null then
    raise exception 'Durable acceptance did not enqueue a report pull';
  end if;

  -- Make this synthetic row deterministically first without mutating any real row.
  update public.gateway_report_pull_job
  set created_at = timestamptz '2000-01-01 00:00:00+00', available_at = now() - interval '1 second'
  where id = queued_job_id;

  select * into claimed from public.claim_gateway_report_pull_job(120);
  if claimed.id is distinct from queued_job_id
     or claimed.person_id is distinct from member_id
     or claimed.pull_kind is distinct from 'reconnect'
     or claimed.session_generation is distinct from 7::bigint
     or claimed.session_ref is distinct from 'runner-durable-acceptance'
     or claimed.claim_token is null
     or claimed.lease_expires_at is null then
    raise exception 'Durable acceptance claim returned unexpected state';
  end if;

  renewed_until := public.renew_gateway_report_pull_job_lease(
    claimed.id, claimed.session_generation, claimed.claim_token, 180
  );
  if renewed_until is null or renewed_until <= now() then
    raise exception 'Durable acceptance lease renewal failed';
  end if;
  if public.renew_gateway_report_pull_job_lease(
    claimed.id, claimed.session_generation, stale_token, 180
  ) is not null then
    raise exception 'Stale claim token renewed a lease';
  end if;

  begin
    perform public.import_gateway_personal_issued_premium(
      claimed.id, claimed.session_generation, stale_token,
      'wtd', business_date, date '2026-08-22', 'August Week 4',
      'durable-wtd.csv', 'durable-wtd-stale', 1, 0, 0, row_payload,
      '{"gatewayWeekStart":"2026-08-22"}'::jsonb, null,
      date '2026-08-01', date '2026-08-31', 4, true
    );
    raise exception 'Stale claim token imported a report';
  exception when others then
    if sqlerrm not like '%stale_gateway_report_pull_job%' then
      raise;
    end if;
  end;

  result := public.import_gateway_personal_issued_premium(
    claimed.id, claimed.session_generation, claimed.claim_token,
    'wtd', business_date, date '2026-08-22', 'August Week 4',
    'durable-wtd.csv', 'durable-wtd', 1, 0, 0, row_payload,
    '{"gatewayWeekStart":"2026-08-22"}'::jsonb, null,
    date '2026-08-01', date '2026-08-31', 4, true
  );
  if result->>'status' <> 'imported' then raise exception 'WTD import failed: %', result; end if;

  result := public.import_gateway_personal_issued_premium(
    claimed.id, claimed.session_generation, claimed.claim_token,
    'mtd', business_date, date '2026-08-01', 'August MTD',
    'durable-mtd.csv', 'durable-mtd', 1, 0, 0, row_payload,
    '{}'::jsonb, null, date '2026-08-01', date '2026-08-31', null, null
  );
  if result->>'status' <> 'imported' then raise exception 'MTD import failed: %', result; end if;

  result := public.import_gateway_personal_issued_premium(
    claimed.id, claimed.session_generation, claimed.claim_token,
    'ytd', business_date, date '2026-01-01', '2026 YTD',
    'durable-ytd.csv', 'durable-ytd', 1, 0, 0, row_payload,
    '{}'::jsonb, null, date '2026-01-01', date '2026-12-31', null, null
  );
  if result->>'status' <> 'imported' then raise exception 'YTD import failed: %', result; end if;

  if (select count(*) from public.gateway_issued_premium_import
      where pull_job_id = claimed.id and source_kind = 'personal_gateway'
        and status in ('imported', 'no_new_report')) <> 3 then
    raise exception 'Durable acceptance did not retain exactly three current report audits';
  end if;
  if (select count(*) from public.producer_issued_premium
      where person_id = member_id and source_kind = 'personal_gateway') <> 3 then
    raise exception 'Durable acceptance did not retain exactly three canonical premium rows';
  end if;

  completed := public.complete_gateway_report_pull_job(
    claimed.id, claimed.session_generation, claimed.claim_token,
    jsonb_build_object('reports', 3, 'pullKind', 'reconnect')
  );
  if completed is not true then
    raise exception 'Durable acceptance completion failed';
  end if;
  if (select status from public.gateway_report_pull_job where id = claimed.id) <> 'succeeded' then
    raise exception 'Durable acceptance job did not become succeeded';
  end if;
  if exists(select 1 from public.gateway_report_pull_job
            where id = claimed.id and (claim_token is not null or lease_expires_at is not null)) then
    raise exception 'Durable acceptance completion did not clear its claim fence';
  end if;
  if (select last_verified_at from public.gateway_connection where person_id = member_id) is null then
    raise exception 'Durable acceptance did not verify the connection on completion';
  end if;

  if public.renew_gateway_report_pull_job_lease(
    claimed.id, claimed.session_generation, claimed.claim_token, 180
  ) is not null then
    raise exception 'Completed claim token renewed a lease';
  end if;
  if public.complete_gateway_report_pull_job(
    claimed.id, claimed.session_generation, claimed.claim_token, '{}'::jsonb
  ) is not false then
    raise exception 'Completed claim token completed the job twice';
  end if;
end;
$$;
