-- Exam attempts — track how many times a recruit has failed the state exam.
-- A failure keeps the recruit on their current licensing step (they reschedule
-- and try again); it never advances the pipeline. The builder can see the count.

alter table recruit
  add column if not exists exam_failures int not null default 0;

-- Defense in depth: clients can read the count but only the guarded function
-- below may change it.
revoke update (exam_failures) on recruit from anon, authenticated;

-- ============================================================
-- recruit_mark_exam_failed — recruit-only. Increments exam_failures.
-- Does NOT change phase/phase_step: the recruit stays put, reschedules, and
-- can mark the exam passed once they retake it.
-- ============================================================
create or replace function recruit_mark_exam_failed(p_recruit uuid)
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
  if v_recruit.person_id <> v_caller then raise exception 'only the recruit can record an exam attempt'; end if;
  if v_recruit.phase <> 'licensing' then raise exception 'only valid in licensing'; end if;
  if v_recruit.phase_step not in ('exam_scheduled', 'studying') then
    raise exception 'must have scheduled exam first';
  end if;

  update recruit set exam_failures = exam_failures + 1 where id = p_recruit
    returning * into v_recruit;
  return v_recruit;
end;
$$;

grant execute on function recruit_mark_exam_failed(uuid) to authenticated;
