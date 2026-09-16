-- Legacy installs allowed a builder row to exist without is_producer=true.
-- Validated Scorecard history makes builder => producer an explicit invariant,
-- so normalize legacy rows before that history is backfilled on clean installs.

update public.person
set is_producer = true
where is_builder
  and not is_producer;
