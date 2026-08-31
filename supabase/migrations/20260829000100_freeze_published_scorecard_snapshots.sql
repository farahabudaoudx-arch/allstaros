-- Ticket #018: finalized Scorecard snapshots must be self-contained frozen
-- presentation artifacts. The validated metric row remains the authoritative
-- source for raw metric payload provenance; the snapshot additionally freezes
-- identity, period display metadata, and exact star/overall results.

create or replace function enforce_validated_scorecard_generation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  run_status text;
  run_period_label text;
  source_run_id uuid;
  source_person_id uuid;
  source_visible_payload jsonb;
  source_full_name text;
  source_photo_url text;
  frozen_metric_payload jsonb;
begin
  if new.metric_run_id is null then
    if new.lifecycle_status in ('final', 'corrected') then
      raise exception 'Finalized Scorecards require validated run provenance.';
    end if;
    return new;
  end if;

  select status, period_label
    into run_status, run_period_label
    from scorecard_metric_run
    where id = new.metric_run_id;
  if run_status not in ('ready', 'generating', 'published', 'delivery_errors') then
    raise exception 'Scorecard artifacts can only be generated from a fully validated run.';
  end if;

  if jsonb_typeof(new.kpi_results) is distinct from 'object'
    or new.kpi_results->>'schemaVersion' is distinct from 'scorecard-published-v1'
    or new.kpi_results->>'cardType' is distinct from new.card_type
    or jsonb_typeof(new.kpi_results->'member') is distinct from 'object'
    or coalesce(btrim(new.kpi_results#>>'{member,fullName}'), '') = ''
    or jsonb_typeof(new.kpi_results->'period') is distinct from 'object'
    or new.kpi_results#>>'{period,kind}' is distinct from new.period_kind
    or new.kpi_results#>>'{period,start}' is distinct from new.period_start::text
    or new.kpi_results#>>'{period,end}' is distinct from new.period_end::text
    or new.kpi_results#>>'{period,label}' is distinct from run_period_label
    or jsonb_typeof(new.kpi_results#>'{period,previous}') is distinct from 'object'
    or coalesce(new.kpi_results#>>'{period,previous,kind}', '') = ''
    or coalesce(new.kpi_results#>>'{period,previous,start}', '') = ''
    or coalesce(new.kpi_results#>>'{period,previous,end}', '') = ''
    or coalesce(new.kpi_results#>>'{period,previous,label}', '') = ''
    or jsonb_typeof(new.kpi_results->'metricPayload') is distinct from 'object'
    or jsonb_typeof(new.kpi_results->'score') is distinct from 'object'
  then
    raise exception 'Finalized Scorecard requires a complete frozen published payload.';
  end if;

  frozen_metric_payload := new.kpi_results->'metricPayload';

  if new.card_type = 'producer' then
    select run_id, person_id, visible_payload
      into source_run_id, source_person_id, source_visible_payload
      from producer_period_metric
      where id = new.producer_metric_id and validated_at is not null;
  else
    select run_id, person_id, visible_payload
      into source_run_id, source_person_id, source_visible_payload
      from builder_period_metric
      where id = new.builder_metric_id and validated_at is not null;
  end if;

  if source_run_id is distinct from new.metric_run_id or source_person_id is distinct from new.person_id then
    raise exception 'Scorecard artifact does not match its validated metric row.';
  end if;
  if source_visible_payload is distinct from frozen_metric_payload then
    raise exception 'Frozen Scorecard metric payload does not match its validated metric row.';
  end if;

  select full_name, photo_url
    into source_full_name, source_photo_url
    from person_role_status_fact
    where run_id = new.metric_run_id and person_id = new.person_id;
  if source_full_name is null
    or source_full_name is distinct from new.kpi_results#>>'{member,fullName}'
    or source_photo_url is distinct from nullif(new.kpi_results#>>'{member,photoUrl}', '')
  then
    raise exception 'Frozen Scorecard member identity does not match the validated run fact.';
  end if;

  if new.lifecycle_status = 'corrected' and not exists (
    select 1 from scorecard_snapshot prior
    where prior.id = new.prior_revision_id
      and prior.person_id = new.person_id
      and prior.card_type = new.card_type
      and prior.period_kind = new.period_kind
      and prior.period_start = new.period_start
      and prior.period_end = new.period_end
      and prior.kpi_results is distinct from new.kpi_results
  ) then
    raise exception 'Corrected Scorecard requires matching lineage and a changed visible payload.';
  end if;
  return new;
end;
$$;

-- Existing scorecard_snapshot_immutable continues to block UPDATE/DELETE after
-- lifecycle_status becomes final/corrected. Existing validated metric/run guards
-- continue to freeze source rows once a run reaches ready. publish_scorecard_run
-- remains the single atomic transaction that inserts snapshots/deliveries and
-- marks the run published only after the complete artifact population exists.
