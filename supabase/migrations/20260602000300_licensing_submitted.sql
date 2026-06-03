-- Licensing finish line — the recruit's final self-serve action inside the
-- licensing phase. After they pass the exam (phase_step = exam_passed) they
-- apply for their license on Sircon, then mark step 5 done. That stamps
-- licensing_submitted_at, which unlocks the closing "you're all set" card and
-- is the signal the upline should be notified to take it from here.
--
-- It deliberately does NOT advance phase/phase_step: moving licensing ->
-- onboarding stays a builder decision (builder_advance_phase). This is just the
-- recruit reporting they've finished everything on their end.

alter table recruit
  add column if not exists licensing_submitted_at timestamptz;

-- Defense in depth: readable by clients, but only the guarded function sets it.
revoke update (licensing_submitted_at) on recruit from anon, authenticated;

-- ============================================================
-- recruit_mark_licensing_submitted — recruit-only. Stamps licensing_submitted_at
-- once the exam is passed. Idempotent: re-confirming keeps the first timestamp.
-- ============================================================
create or replace function recruit_mark_licensing_submitted(p_recruit uuid)
returns recruit
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recruit recruit%rowtype;
  v_caller uuid := auth_person_id();
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  select * into v_recruit from recruit where id = p_recruit for update;
  if not found then raise exception 'recruit not found'; end if;
  if v_recruit.person_id <> v_caller then raise exception 'only the recruit can submit their licensing'; end if;
  if v_recruit.phase <> 'licensing' then raise exception 'only valid in licensing'; end if;
  if v_recruit.phase_step <> 'exam_passed' then raise exception 'must pass the exam first'; end if;

  if v_recruit.licensing_submitted_at is null then
    update recruit set licensing_submitted_at = now() where id = p_recruit
      returning * into v_recruit;
  end if;
  return v_recruit;
end;
$$;

grant execute on function recruit_mark_licensing_submitted(uuid) to authenticated;
