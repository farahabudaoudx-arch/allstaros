-- Remove the "must be flagged first" gate on recruit removal. A builder can now
-- remove ANY recruit in their downline — flagging and removal are independent.
-- (Replaces the version in 20260525000600_flagging.sql that required flagged.)
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
