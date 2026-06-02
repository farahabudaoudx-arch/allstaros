-- recruit_mark_studying — recruit-only. Moves exam_scheduled → studying.
-- Gives the recruit an explicit "I've got my study login and I'm studying"
-- action so the licensing timeline advances one step at a time. Without it,
-- the only path to `studying` is the check-in trigger (nudge_studying_on_checkin).
create or replace function recruit_mark_studying(p_recruit uuid)
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
  if v_recruit.person_id <> v_caller then raise exception 'only the recruit can update their study status'; end if;
  if v_recruit.phase <> 'licensing' then raise exception 'only valid in licensing'; end if;
  if v_recruit.phase_step <> 'exam_scheduled' then
    raise exception 'must schedule the exam first (current step: %)', coalesce(v_recruit.phase_step, 'none');
  end if;

  update recruit set phase_step = 'studying' where id = p_recruit
    returning * into v_recruit;
  return v_recruit;
end;
$$;

grant execute on function recruit_mark_studying(uuid) to authenticated;
