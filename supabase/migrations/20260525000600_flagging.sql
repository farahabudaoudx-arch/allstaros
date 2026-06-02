-- Section 6 — flagging.
-- A single configurable threshold for "lapsed check-ins" lives in app code
-- (STALL_LAPSE_DAYS). For SQL-side defaults we mirror it here in a constant
-- function so it stays tunable in one place per environment.

create or replace function stall_lapse_days() returns int
language sql immutable as $$ select 3 $$;

-- ============================================================
-- compute_stalls — scans every non-removed recruit and updates flagged/flag_reason.
-- Idempotent: a recruit that has been un-stalled clears their flag.
-- Returns the number of rows affected.
-- ============================================================
create or replace function compute_stalls()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold int := stall_lapse_days();
  v_affected int := 0;
  v_recruit recruit%rowtype;
  v_last_checkin date;
  v_bootcamp_count int;
  v_should_flag boolean;
  v_reason text;
begin
  for v_recruit in select * from recruit where removed_at is null loop
    v_should_flag := false;
    v_reason := null;

    select max(check_in_date) into v_last_checkin
      from check_in where recruit_id = v_recruit.id;

    if v_recruit.phase = 'licensing' then
      if v_recruit.exam_date is null
         and v_recruit.created_at < now() - (v_threshold || ' days')::interval then
        v_should_flag := true;
        v_reason := 'exam not scheduled';
      elsif v_last_checkin is null
            and v_recruit.created_at < now() - (v_threshold || ' days')::interval then
        v_should_flag := true;
        v_reason := 'no check-ins yet';
      elsif v_last_checkin is not null and v_last_checkin < current_date - v_threshold then
        v_should_flag := true;
        v_reason := 'check-ins lapsed';
      end if;

    elsif v_recruit.phase = 'onboarding' then
      if v_last_checkin is not null and v_last_checkin < current_date - v_threshold then
        v_should_flag := true;
        v_reason := 'check-ins lapsed';
      end if;

    elsif v_recruit.phase = 'bootcamp' then
      if v_recruit.bootcamp_started_at is not null
         and v_recruit.bootcamp_started_at + interval '28 days' <= current_date then
        select count(*) into v_bootcamp_count
          from policy_submission
          where recruit_id = v_recruit.id
            and submitted_at >= v_recruit.bootcamp_started_at
            and submitted_at < v_recruit.bootcamp_started_at + interval '28 days';
        if v_bootcamp_count < 8 then
          v_should_flag := true;
          v_reason := 'bootcamp gate missed';
        end if;
      elsif v_last_checkin is not null and v_last_checkin < current_date - v_threshold then
        v_should_flag := true;
        v_reason := 'check-ins lapsed';
      end if;
    end if;

    -- Persist any state change.
    if v_should_flag <> v_recruit.flagged
       or coalesce(v_reason, '') <> coalesce(v_recruit.flag_reason, '') then
      update recruit
        set flagged = v_should_flag,
            flag_reason = case when v_should_flag then v_reason else null end
        where id = v_recruit.id;
      v_affected := v_affected + 1;
    end if;
  end loop;

  return v_affected;
end;
$$;

grant execute on function compute_stalls() to authenticated;

-- ============================================================
-- remove_recruit — builder-only. Requires the recruit to be flagged.
-- Sets removed_at and person.status = 'removed'. Row is retained.
-- ============================================================
create or replace function remove_recruit(p_recruit uuid, p_reason text)
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
  if not exists (select 1 from person where id = v_caller and is_builder) then
    raise exception 'builder only';
  end if;

  select * into v_recruit from recruit where id = p_recruit for update;
  if not found then raise exception 'recruit not found'; end if;
  if not can_view(v_recruit.person_id) then raise exception 'not authorized'; end if;
  if v_recruit.removed_at is not null then raise exception 'already removed'; end if;
  if not v_recruit.flagged then
    raise exception 'cannot remove an unflagged recruit (Section 6: flag and removal are separate)';
  end if;

  update recruit
    set removed_at = now(),
        flag_reason = coalesce(p_reason, flag_reason)
    where id = p_recruit
    returning * into v_recruit;

  update person
    set status = 'removed'
    where id = v_recruit.person_id;

  return v_recruit;
end;
$$;

grant execute on function remove_recruit(uuid, text) to authenticated;
