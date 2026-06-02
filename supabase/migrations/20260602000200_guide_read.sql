-- Guide gate — before any licensing step unlocks, the recruit reads the
-- "How To Pass Your Life Insurance Exam On The First Try" guide. guide_read_at
-- records that acknowledgement. It never advances phase/phase_step; it's a soft
-- onboarding gate that sits in front of "schedule your exam".

alter table recruit
  add column if not exists guide_read_at timestamptz;

-- Defense in depth: clients can read it but only the guarded function may set it.
revoke update (guide_read_at) on recruit from anon, authenticated;

-- ============================================================
-- recruit_mark_guide_read — recruit-only. Stamps guide_read_at once.
-- Idempotent: re-confirming is a no-op so the timestamp reflects first read.
-- ============================================================
create or replace function recruit_mark_guide_read(p_recruit uuid)
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
  if v_recruit.person_id <> v_caller then raise exception 'only the recruit can confirm reading the guide'; end if;
  if v_recruit.phase <> 'licensing' then raise exception 'only valid in licensing'; end if;

  if v_recruit.guide_read_at is null then
    update recruit set guide_read_at = now() where id = p_recruit
      returning * into v_recruit;
  end if;
  return v_recruit;
end;
$$;

grant execute on function recruit_mark_guide_read(uuid) to authenticated;
