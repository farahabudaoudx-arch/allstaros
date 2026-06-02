-- Section 5 — pipeline state machine.
-- Phase/phase_step are never settable directly by clients. All changes flow
-- through guarded SECURITY DEFINER functions that enforce the gate logic.

-- ============================================================
-- Column-level revokes: defense in depth.
-- Clients can read everything they can SELECT, but cannot UPDATE the
-- state-machine columns directly. Server actions call the functions below.
-- ============================================================
revoke update (
  phase,
  phase_step,
  builder_id,
  bootcamp_started_at,
  flagged,
  flag_reason,
  removed_at
) on recruit from anon, authenticated;

-- The recruit's exam_date is still client-updatable (recruit_set_exam_date does
-- it via SECURITY DEFINER, but the column itself stays open as a fallback).

-- ============================================================
-- recruit_set_exam_date — recruit-only. Moves logged_in → exam_scheduled.
-- ============================================================
create or replace function recruit_set_exam_date(p_recruit uuid, p_date date)
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
  if v_recruit.person_id <> v_caller then raise exception 'only the recruit can set their exam date'; end if;
  if v_recruit.phase <> 'licensing' then raise exception 'exam date can only be set during licensing'; end if;
  if p_date < current_date then raise exception 'exam date must be in the future'; end if;

  update recruit
    set exam_date = p_date,
        phase_step = case when phase_step in ('logged_in', null) or phase_step is null then 'exam_scheduled' else phase_step end
    where id = p_recruit
    returning * into v_recruit;
  return v_recruit;
end;
$$;

grant execute on function recruit_set_exam_date(uuid, date) to authenticated;

-- ============================================================
-- recruit_mark_exam_passed — recruit-only. Sets phase_step=exam_passed.
-- Builder still has to confirm to advance the phase to onboarding.
-- ============================================================
create or replace function recruit_mark_exam_passed(p_recruit uuid)
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
  if v_recruit.person_id <> v_caller then raise exception 'only the recruit can mark their exam passed'; end if;
  if v_recruit.phase <> 'licensing' then raise exception 'only valid in licensing'; end if;
  if v_recruit.phase_step not in ('exam_scheduled', 'studying') then
    raise exception 'must have scheduled exam first';
  end if;

  update recruit set phase_step = 'exam_passed' where id = p_recruit
    returning * into v_recruit;
  return v_recruit;
end;
$$;

grant execute on function recruit_mark_exam_passed(uuid) to authenticated;

-- ============================================================
-- builder_advance_phase — the main guarded transition.
-- Caller must be a builder who can_view the recruit.
-- ============================================================
create or replace function builder_advance_phase(p_recruit uuid, p_to_phase text)
returns recruit
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recruit recruit%rowtype;
  v_caller uuid := auth_person_id();
  v_onboarding_assignments int;
  v_completed int;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from person where id = v_caller and is_builder) then
    raise exception 'builder only';
  end if;

  select * into v_recruit from recruit where id = p_recruit for update;
  if not found then raise exception 'recruit not found'; end if;
  if not can_view(v_recruit.person_id) then raise exception 'not authorized'; end if;
  if v_recruit.removed_at is not null then raise exception 'recruit is removed'; end if;

  -- licensing -> onboarding: recruit must be at exam_passed.
  if v_recruit.phase = 'licensing' and p_to_phase = 'onboarding' then
    if v_recruit.phase_step <> 'exam_passed' then
      raise exception 'cannot move to onboarding before exam_passed (current step: %)', coalesce(v_recruit.phase_step, 'none');
    end if;
    update recruit
      set phase = 'onboarding', phase_step = 'training'
      where id = p_recruit
      returning * into v_recruit;
    return v_recruit;
  end if;

  -- onboarding -> bootcamp: all three substeps complete.
  -- "All three must be done before the builder can move the recruit to bootcamp." (Section 5.3)
  if v_recruit.phase = 'onboarding' and p_to_phase = 'bootcamp' then
    if v_recruit.phase_step <> 'contracting' then
      raise exception 'must finish onboarding (current step: %)', coalesce(v_recruit.phase_step, 'none');
    end if;
    -- Also require all assignment lessons completed.
    select count(*) into v_onboarding_assignments
      from training_lesson where phase = 'onboarding' and is_assignment;
    select count(*) into v_completed
      from lesson_completion lc
      join training_lesson tl on tl.id = lc.lesson_id
      where lc.recruit_id = p_recruit and tl.phase = 'onboarding' and tl.is_assignment;
    if v_completed < v_onboarding_assignments then
      raise exception 'training assignments not all complete (%/%)', v_completed, v_onboarding_assignments;
    end if;

    update recruit
      set phase = 'bootcamp',
          phase_step = 'active',
          bootcamp_started_at = current_date
      where id = p_recruit
      returning * into v_recruit;
    return v_recruit;
  end if;

  raise exception 'invalid transition: % -> %', v_recruit.phase, p_to_phase;
end;
$$;

grant execute on function builder_advance_phase(uuid, text) to authenticated;

-- ============================================================
-- builder_set_step — builder-driven step changes within a phase.
--   licensing.exam_passed (confirm) is also handled by builder_advance_phase above
--   so this is mainly for onboarding (training → roleplay → contracting).
-- ============================================================
create or replace function builder_set_step(p_recruit uuid, p_to_step text)
returns recruit
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recruit recruit%rowtype;
  v_caller uuid := auth_person_id();
  v_assignments int;
  v_completed int;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from person where id = v_caller and is_builder) then
    raise exception 'builder only';
  end if;

  select * into v_recruit from recruit where id = p_recruit for update;
  if not found then raise exception 'recruit not found'; end if;
  if not can_view(v_recruit.person_id) then raise exception 'not authorized'; end if;
  if v_recruit.removed_at is not null then raise exception 'recruit is removed'; end if;

  if v_recruit.phase = 'onboarding' then
    -- training -> roleplay: require all onboarding assignment lessons complete.
    if v_recruit.phase_step = 'training' and p_to_step = 'roleplay' then
      select count(*) into v_assignments
        from training_lesson where phase = 'onboarding' and is_assignment;
      select count(*) into v_completed
        from lesson_completion lc
        join training_lesson tl on tl.id = lc.lesson_id
        where lc.recruit_id = p_recruit and tl.phase = 'onboarding' and tl.is_assignment;
      if v_completed < v_assignments then
        raise exception 'training assignments not all complete (%/%)', v_completed, v_assignments;
      end if;

      update recruit set phase_step = 'roleplay' where id = p_recruit
        returning * into v_recruit;
      return v_recruit;
    end if;

    -- roleplay -> contracting: builder marks roleplay passed (judgment call, no scorecard).
    if v_recruit.phase_step = 'roleplay' and p_to_step = 'contracting' then
      update recruit set phase_step = 'contracting' where id = p_recruit
        returning * into v_recruit;
      return v_recruit;
    end if;
  end if;

  raise exception 'invalid step transition: % (phase=%) -> %',
    coalesce(v_recruit.phase_step, 'none'), v_recruit.phase, p_to_step;
end;
$$;

grant execute on function builder_set_step(uuid, text) to authenticated;

-- ============================================================
-- Trigger: when a recruit posts a check-in during licensing,
-- nudge phase_step from exam_scheduled → studying.
-- ============================================================
create or replace function nudge_studying_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update recruit
    set phase_step = 'studying'
    where id = new.recruit_id
      and phase = 'licensing'
      and phase_step = 'exam_scheduled';
  return new;
end;
$$;

drop trigger if exists check_in_nudge_studying on check_in;
create trigger check_in_nudge_studying
  after insert on check_in
  for each row execute function nudge_studying_on_checkin();

-- ============================================================
-- Trigger: auto-graduate when 8 policy submissions land within 28 days
-- of bootcamp_started_at. (Section 5.4.)
-- ============================================================
create or replace function check_graduation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recruit recruit%rowtype;
  v_count int;
begin
  select * into v_recruit from recruit where id = new.recruit_id;
  if v_recruit.phase <> 'bootcamp' then return new; end if;
  if v_recruit.bootcamp_started_at is null then return new; end if;

  select count(*) into v_count
    from policy_submission
    where recruit_id = new.recruit_id
      and submitted_at >= v_recruit.bootcamp_started_at
      and submitted_at < v_recruit.bootcamp_started_at + interval '28 days';

  if v_count >= 8 then
    update recruit
      set phase = 'graduated', phase_step = null
      where id = new.recruit_id;
  end if;

  return new;
end;
$$;

drop trigger if exists policy_submission_check_grad on policy_submission;
create trigger policy_submission_check_grad
  after insert on policy_submission
  for each row execute function check_graduation();
