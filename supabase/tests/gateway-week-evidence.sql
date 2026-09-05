-- Run only inside BEGIN + the hardening migration + this file + ROLLBACK.
-- Assertions raise on failure; the synthetic member and all reports must roll back.
do $$
declare
  member_id uuid := gen_random_uuid();
  job_id uuid := gen_random_uuid();
  token uuid := gen_random_uuid();
  result jsonb;
  current_import uuid;
  evidence text;
  row_payload jsonb := '{"producer":"Week Evidence Acceptance","producerNpn":"999800007","personalIpCents":100,"teamIpCents":200,"outsideFirstLegCents":100}'::jsonb;
begin
  insert into public.person(id, full_name, email, is_producer, status, npn)
  values(member_id, 'Week Evidence Acceptance', 'week-evidence-' || member_id || '@acceptance.invalid', true, 'active', '999800007');
  insert into public.gateway_connection(person_id, status, session_ref, session_generation, first_connected_at, connected_at)
  values(member_id, 'connected', 'week-evidence-acceptance', 1, now(), now());
  insert into public.gateway_report_pull_job(id, person_id, session_generation, pull_kind, business_date,
    status, available_at, claimed_at, claim_token, lease_expires_at, attempt_count)
  values(job_id, member_id, 1, 'first_connect', '2026-09-05', 'running', now(), now(), token, now() + interval '15 minutes', 1);

  -- Missing metadata -> supplied A -> repeated A -> corrected B -> restored A.
  foreach evidence in array array[null::text, '2026-08-24', '2026-08-24', '2026-08-31', '2026-08-24'] loop
    result := public.import_gateway_personal_issued_premium(
      job_id, 1, token, 'wtd', '2026-09-05', '2026-09-05', 'August Week 5', 'same.csv', 'same-bytes', 1, 0, 0,
      row_payload, jsonb_strip_nulls(jsonb_build_object('gatewayWeekStart', evidence)), null,
      '2026-08-01', '2026-08-31', 5, true);
    if result->>'status' not in ('imported', 'no_new_report') then raise exception 'Unexpected result: %', result; end if;
    select premium.import_id into current_import from public.producer_issued_premium premium
    where premium.person_id = member_id and premium.period_type = 'wtd';
    if (select i.summary->>'gatewayWeekStart' from public.gateway_issued_premium_import i where i.id = current_import)
       is distinct from evidence then raise exception 'Current audit did not retain corrected provider date'; end if;
  end loop;
  if (select count(*) from public.gateway_issued_premium_import where person_id = member_id and status = 'imported') <> 4 then
    raise exception 'Changed metadata was deduped or repeated metadata was imported';
  end if;
  if (select count(*) from public.gateway_issued_premium_import where person_id = member_id and status = 'no_new_report') <> 1 then
    raise exception 'Identical date metadata did not dedupe';
  end if;
  if (select count(*) from public.producer_issued_premium where person_id = member_id) <> 1 then
    raise exception 'Metadata correction duplicated the canonical week';
  end if;
  begin
    perform public.import_gateway_personal_issued_premium(
      job_id, 1, token, 'wtd', '2026-09-05', '2026-09-05', 'August Week 5', 'same.csv', 'same-bytes', 1, 0, 0,
      row_payload, '{"gatewayWeekStart":"2026-02-31"}', null, '2026-08-01', '2026-08-31', 5, true);
    raise exception 'Impossible provider date was accepted';
  exception when datetime_field_overflow then null;
  end;
end;
$$;
