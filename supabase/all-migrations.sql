-- Extensions used across the schema.
create extension if not exists pgcrypto;
-- All Star OS — Section 4 schema.
-- All ids are uuid. All tables carry created_at and updated_at.

-- Shared updated_at trigger.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 4.1 person — one row per human in the system.
-- ============================================================
create table if not exists person (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  full_name text not null,
  email text not null,
  upline_id uuid references person(id) on delete restrict,
  is_builder boolean not null default false,
  is_producer boolean not null default false,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists person_upline_idx on person(upline_id);
create index if not exists person_auth_user_idx on person(auth_user_id);
create unique index if not exists person_email_unique on person(lower(email));

drop trigger if exists person_updated_at on person;
create trigger person_updated_at
  before update on person
  for each row execute function set_updated_at();

-- ============================================================
-- 4.2 recruit — pipeline state for a person being recruited.
-- A person row and a recruit row are distinct.
-- ============================================================
create table if not exists recruit (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references person(id) on delete restrict,
  builder_id uuid not null references person(id) on delete restrict,
  phase text not null default 'licensing'
    check (phase in ('interview', 'licensing', 'onboarding', 'bootcamp', 'graduated')),
  phase_step text,
  exam_date date,
  bootcamp_started_at date,
  flagged boolean not null default false,
  flag_reason text,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruit_builder_idx on recruit(builder_id);
create index if not exists recruit_phase_idx on recruit(phase);
create index if not exists recruit_flagged_idx on recruit(flagged) where flagged;

drop trigger if exists recruit_updated_at on recruit;
create trigger recruit_updated_at
  before update on recruit
  for each row execute function set_updated_at();

-- ============================================================
-- 4.3 check_in — daily check-ins (one per recruit per day).
-- ============================================================
create table if not exists check_in (
  id uuid primary key default gen_random_uuid(),
  recruit_id uuid not null references recruit(id) on delete cascade,
  check_in_date date not null,
  summary text not null,
  pacing jsonb,
  actuals jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recruit_id, check_in_date)
);

create index if not exists check_in_recruit_date_idx on check_in(recruit_id, check_in_date desc);

drop trigger if exists check_in_updated_at on check_in;
create trigger check_in_updated_at
  before update on check_in
  for each row execute function set_updated_at();

-- ============================================================
-- 4.4 message — per-recruit thread.
-- ============================================================
create table if not exists message (
  id uuid primary key default gen_random_uuid(),
  recruit_id uuid not null references recruit(id) on delete cascade,
  sender_person_id uuid references person(id) on delete set null,
  body text not null,
  is_ai boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_recruit_idx on message(recruit_id, created_at);

drop trigger if exists message_updated_at on message;
create trigger message_updated_at
  before update on message
  for each row execute function set_updated_at();

-- ============================================================
-- 4.5 milestone — bootcamp celebration moments.
-- ============================================================
create table if not exists milestone (
  id uuid primary key default gen_random_uuid(),
  recruit_id uuid not null references recruit(id) on delete cascade,
  kind text not null check (kind in ('first_dial', 'first_presentation', 'first_policy', 'first_deposit')),
  reached_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recruit_id, kind)
);

create index if not exists milestone_recruit_idx on milestone(recruit_id);

drop trigger if exists milestone_updated_at on milestone;
create trigger milestone_updated_at
  before update on milestone
  for each row execute function set_updated_at();

-- ============================================================
-- 4.5 policy_submission — counts toward the 8-in-28 gate.
-- ============================================================
create table if not exists policy_submission (
  id uuid primary key default gen_random_uuid(),
  recruit_id uuid not null references recruit(id) on delete cascade,
  submitted_at date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists policy_submission_recruit_idx on policy_submission(recruit_id, submitted_at);

drop trigger if exists policy_submission_updated_at on policy_submission;
create trigger policy_submission_updated_at
  before update on policy_submission
  for each row execute function set_updated_at();

-- ============================================================
-- 4.6 training_lesson — container for CEO-provided videos.
-- ============================================================
create table if not exists training_lesson (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  video_url text,
  phase text not null check (phase in ('licensing', 'onboarding')),
  sort_order int not null default 0,
  is_assignment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_lesson_phase_idx on training_lesson(phase, sort_order);

drop trigger if exists training_lesson_updated_at on training_lesson;
create trigger training_lesson_updated_at
  before update on training_lesson
  for each row execute function set_updated_at();

create table if not exists lesson_completion (
  id uuid primary key default gen_random_uuid(),
  recruit_id uuid not null references recruit(id) on delete cascade,
  lesson_id uuid not null references training_lesson(id) on delete cascade,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recruit_id, lesson_id)
);

create index if not exists lesson_completion_recruit_idx on lesson_completion(recruit_id);

drop trigger if exists lesson_completion_updated_at on lesson_completion;
create trigger lesson_completion_updated_at
  before update on lesson_completion
  for each row execute function set_updated_at();

-- ============================================================
-- Section 5.2 — motivational videos (separate from training_lesson by design).
-- A pre-exam-pass content feed; the how-to-do-the-job training is hidden until onboarding.
-- ============================================================
create table if not exists motivational_video (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  video_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists motivational_video_updated_at on motivational_video;
create trigger motivational_video_updated_at
  before update on motivational_video
  for each row execute function set_updated_at();
-- Section 3 — visibility helpers. Used by every RLS policy on pipeline tables.

-- Resolve the Supabase auth user to their person row.
create or replace function auth_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from person where auth_user_id = auth.uid() limit 1;
$$;

-- Returns true if target_person is the current user OR anywhere in their downline.
-- Recursive CTE seeded from the current user's person row, walking down via upline_id.
create or replace function can_view(target_person uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive downline as (
    select id from person where id = auth_person_id()
    union all
    select p.id
    from person p
    join downline d on p.upline_id = d.id
  )
  select target_person in (select id from downline);
$$;

-- Convenience wrapper for tables that key off a recruit row.
create or replace function can_view_recruit(target_recruit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select can_view(r.person_id)
  from recruit r
  where r.id = target_recruit;
$$;

grant execute on function auth_person_id() to authenticated;
grant execute on function can_view(uuid) to authenticated;
grant execute on function can_view_recruit(uuid) to authenticated;
-- Section 3 — Row Level Security. The visibility rule lives here, not in app code.

-- ============================================================
-- person
-- ============================================================
alter table person enable row level security;

drop policy if exists person_select on person;
create policy person_select on person
  for select to authenticated
  using (can_view(id));

-- Writes happen server-side with service_role. No client INSERT/UPDATE/DELETE policy.
-- A person can update their own row's display fields if we need it later (not in V1 scope).

-- ============================================================
-- recruit
-- ============================================================
alter table recruit enable row level security;

drop policy if exists recruit_select on recruit;
create policy recruit_select on recruit
  for select to authenticated
  using (can_view(person_id));

-- The recruit themselves can update their own exam_date (Section 5.2).
-- Phase transitions go through the guarded function, which is security_definer.
drop policy if exists recruit_self_update on recruit;
create policy recruit_self_update on recruit
  for update to authenticated
  using (person_id = auth_person_id())
  with check (person_id = auth_person_id());

-- ============================================================
-- check_in
-- ============================================================
alter table check_in enable row level security;

drop policy if exists check_in_select on check_in;
create policy check_in_select on check_in
  for select to authenticated
  using (can_view_recruit(recruit_id));

-- A recruit can insert/update their own daily check-in.
drop policy if exists check_in_self_insert on check_in;
create policy check_in_self_insert on check_in
  for insert to authenticated
  with check (
    exists (
      select 1 from recruit r
      where r.id = recruit_id and r.person_id = auth_person_id()
    )
  );

drop policy if exists check_in_self_update on check_in;
create policy check_in_self_update on check_in
  for update to authenticated
  using (
    exists (
      select 1 from recruit r
      where r.id = recruit_id and r.person_id = auth_person_id()
    )
  );

-- ============================================================
-- message
-- ============================================================
alter table message enable row level security;

drop policy if exists message_select on message;
create policy message_select on message
  for select to authenticated
  using (can_view_recruit(recruit_id));

-- Anyone who can view the thread can post to it. The sender must be themselves
-- (or the AI assistant, inserted server-side with service_role).
drop policy if exists message_insert on message;
create policy message_insert on message
  for insert to authenticated
  with check (
    can_view_recruit(recruit_id)
    and sender_person_id = auth_person_id()
    and is_ai = false
  );

-- ============================================================
-- milestone
-- ============================================================
alter table milestone enable row level security;

drop policy if exists milestone_select on milestone;
create policy milestone_select on milestone
  for select to authenticated
  using (can_view_recruit(recruit_id));

-- The recruit themselves marks their milestones.
drop policy if exists milestone_self_insert on milestone;
create policy milestone_self_insert on milestone
  for insert to authenticated
  with check (
    exists (
      select 1 from recruit r
      where r.id = recruit_id and r.person_id = auth_person_id()
    )
  );

-- ============================================================
-- policy_submission
-- ============================================================
alter table policy_submission enable row level security;

drop policy if exists policy_submission_select on policy_submission;
create policy policy_submission_select on policy_submission
  for select to authenticated
  using (can_view_recruit(recruit_id));

drop policy if exists policy_submission_self_insert on policy_submission;
create policy policy_submission_self_insert on policy_submission
  for insert to authenticated
  with check (
    exists (
      select 1 from recruit r
      where r.id = recruit_id and r.person_id = auth_person_id()
    )
  );

-- ============================================================
-- training_lesson — visible to all authenticated users.
-- Gating (e.g. study materials locked pre-exam_date) is enforced in app code
-- because the lesson rows themselves are not personal data.
-- ============================================================
alter table training_lesson enable row level security;

drop policy if exists training_lesson_select on training_lesson;
create policy training_lesson_select on training_lesson
  for select to authenticated
  using (true);

-- ============================================================
-- lesson_completion
-- ============================================================
alter table lesson_completion enable row level security;

drop policy if exists lesson_completion_select on lesson_completion;
create policy lesson_completion_select on lesson_completion
  for select to authenticated
  using (can_view_recruit(recruit_id));

drop policy if exists lesson_completion_self_insert on lesson_completion;
create policy lesson_completion_self_insert on lesson_completion
  for insert to authenticated
  with check (
    exists (
      select 1 from recruit r
      where r.id = recruit_id and r.person_id = auth_person_id()
    )
  );

-- ============================================================
-- motivational_video — visible to all authenticated users.
-- ============================================================
alter table motivational_video enable row level security;

drop policy if exists motivational_video_select on motivational_video;
create policy motivational_video_select on motivational_video
  for select to authenticated
  using (true);
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

-- ============================================================
-- Bootstrap — make the current Supabase auth user the org-root builder.
-- Runs idempotently: re-running won't duplicate. Update the name/email
-- if you want to override what's on auth.users.
-- ============================================================
insert into person (full_name, email, is_builder, auth_user_id)
select
  coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  email,
  true,
  id
from auth.users
where email = 'nicholasverge@gmail.com'
on conflict (auth_user_id) do nothing;

-- ============================================================
-- Owner god-mode visibility (migration 20260601000100).
-- An owner sees every person and recruit regardless of tree position.
-- ============================================================
alter table person add column if not exists is_owner boolean not null default false;

create or replace function can_view(target_person uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive downline as (
    select id from person where id = auth_person_id()
    union all
    select p.id
    from person p
    join downline d on p.upline_id = d.id
  )
  select
    exists (select 1 from person where id = auth_person_id() and is_owner)
    or target_person in (select id from downline);
$$;

insert into person (full_name, email, is_builder, is_owner, upline_id)
values ('Nicholas Verge', 'nicholasverge@gmail.com', true, true, null)
on conflict (lower(email)) do update
  set is_builder = true,
      is_owner = true;


-- Producer sales-tracking tables.
-- Ported from the LifeLeads app's closed-loop schema
-- (lead → contact → appointment → presentation → sale → policy → deposit,
-- plus per-day activity totals in tracker_entry) so the producer dashboard
-- and analytics view can render real numbers.
--
-- LifeLeads scoped everything to an agency `account_id` + acting `agent_id`.
-- In All Star OS each producer IS a person, so every table is scoped to a
-- single `person_id` referencing person(id). Visibility reuses the existing
-- can_view() helper: a producer sees their own rows, an upline sees their
-- downline's rows, and an owner sees everyone. Writes are pinned to the
-- acting person via auth_person_id().

-- ---------------------------------------------------------------------------
-- sales_lead: an inbound insurance lead worked by a producer
-- ---------------------------------------------------------------------------
create table if not exists sales_lead (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  state text,
  age integer,
  received_at timestamptz not null default now()
);
create index if not exists sales_lead_person_received_idx
  on sales_lead(person_id, received_at desc);
create index if not exists sales_lead_person_state_idx
  on sales_lead(person_id, state);

-- ---------------------------------------------------------------------------
-- contact_attempt: one row per dial attempted against a lead
-- ---------------------------------------------------------------------------
create table if not exists contact_attempt (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  lead_id uuid not null references sales_lead(id) on delete cascade,
  outcome text not null check (outcome in (
    'connected','voicemail','no_answer','wrong_number','dnc','disconnected','callback'
  )),
  duration_sec integer not null default 0 check (duration_sec >= 0),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists contact_attempt_person_created_idx
  on contact_attempt(person_id, created_at desc);
create index if not exists contact_attempt_lead_idx
  on contact_attempt(lead_id);

-- ---------------------------------------------------------------------------
-- appointment: a scheduled meeting with a lead
-- ---------------------------------------------------------------------------
create table if not exists appointment (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  lead_id uuid not null references sales_lead(id) on delete cascade,
  scheduled_for timestamptz not null,
  showed boolean,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists appointment_person_scheduled_idx
  on appointment(person_id, scheduled_for desc);
create index if not exists appointment_lead_idx
  on appointment(lead_id);

-- ---------------------------------------------------------------------------
-- presentation: a sales presentation given (usually after an appointment)
-- ---------------------------------------------------------------------------
create table if not exists presentation (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  appointment_id uuid references appointment(id) on delete set null,
  lead_id uuid not null references sales_lead(id) on delete cascade,
  outcome text not null check (outcome in (
    'closed','objected','thinking','no_show','other'
  )),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists presentation_person_created_idx
  on presentation(person_id, created_at desc);
create index if not exists presentation_lead_idx
  on presentation(lead_id);

-- ---------------------------------------------------------------------------
-- sale: a closed sale. Total AP = sum(annual_premium_cents).
-- ---------------------------------------------------------------------------
create table if not exists sale (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  presentation_id uuid references presentation(id) on delete set null,
  lead_id uuid not null references sales_lead(id) on delete cascade,
  carrier text not null,
  face_amount_cents integer not null check (face_amount_cents >= 0),
  monthly_premium_cents integer not null check (monthly_premium_cents >= 0),
  annual_premium_cents integer not null check (annual_premium_cents >= 0),
  beneficiary_name text,
  effective_date date,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists sale_person_created_idx
  on sale(person_id, created_at desc);
create index if not exists sale_person_carrier_idx
  on sale(person_id, carrier);
create index if not exists sale_lead_idx
  on sale(lead_id);

-- ---------------------------------------------------------------------------
-- issued_policy: a sale the carrier actually issued. Total IP = sum of the
-- joined sale.annual_premium_cents where status in ('issued','lapsed').
-- (Named issued_policy to avoid the POLICY keyword and the existing
-- policy_submission table.)
-- ---------------------------------------------------------------------------
create table if not exists issued_policy (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  sale_id uuid not null unique references sale(id) on delete cascade,
  policy_number text,
  status text not null default 'issued' check (status in (
    'issued','declined','cancelled','lapsed'
  )),
  issued_at timestamptz not null default now(),
  cancelled_at timestamptz,
  notes text
);
create index if not exists issued_policy_person_issued_idx
  on issued_policy(person_id, issued_at desc);

-- ---------------------------------------------------------------------------
-- deposit: money actually received against an issued policy
-- ---------------------------------------------------------------------------
create table if not exists deposit (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  policy_id uuid not null references issued_policy(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'received' check (status in (
    'received','nsf','refunded'
  )),
  received_at timestamptz not null default now(),
  notes text
);
create index if not exists deposit_person_received_idx
  on deposit(person_id, received_at desc);
create index if not exists deposit_policy_idx
  on deposit(policy_id);

-- ---------------------------------------------------------------------------
-- tracker_entry: per-day activity totals entered on the Tracker page
-- ---------------------------------------------------------------------------
create table if not exists tracker_entry (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  entry_date date not null,
  dials integer not null default 0 check (dials >= 0),
  contacts integer not null default 0 check (contacts >= 0),
  appointments integer not null default 0 check (appointments >= 0),
  presentations integer not null default 0 check (presentations >= 0),
  sales integer not null default 0 check (sales >= 0),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, entry_date)
);
create index if not exists tracker_entry_person_date_idx
  on tracker_entry(person_id, entry_date desc);

drop trigger if exists tracker_entry_updated_at on tracker_entry;
create trigger tracker_entry_updated_at
  before update on tracker_entry
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Read = can_view(person_id) (self + downline + owner). Write = self only.
-- ---------------------------------------------------------------------------
alter table sales_lead      enable row level security;
alter table contact_attempt enable row level security;
alter table appointment     enable row level security;
alter table presentation    enable row level security;
alter table sale            enable row level security;
alter table issued_policy   enable row level security;
alter table deposit         enable row level security;
alter table tracker_entry   enable row level security;

drop policy if exists "sales_lead: read" on sales_lead;
create policy "sales_lead: read" on sales_lead for select using (can_view(person_id));
drop policy if exists "sales_lead: write" on sales_lead;
create policy "sales_lead: write" on sales_lead for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "contact_attempt: read" on contact_attempt;
create policy "contact_attempt: read" on contact_attempt for select using (can_view(person_id));
drop policy if exists "contact_attempt: write" on contact_attempt;
create policy "contact_attempt: write" on contact_attempt for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "appointment: read" on appointment;
create policy "appointment: read" on appointment for select using (can_view(person_id));
drop policy if exists "appointment: write" on appointment;
create policy "appointment: write" on appointment for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "presentation: read" on presentation;
create policy "presentation: read" on presentation for select using (can_view(person_id));
drop policy if exists "presentation: write" on presentation;
create policy "presentation: write" on presentation for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "sale: read" on sale;
create policy "sale: read" on sale for select using (can_view(person_id));
drop policy if exists "sale: write" on sale;
create policy "sale: write" on sale for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "issued_policy: read" on issued_policy;
create policy "issued_policy: read" on issued_policy for select using (can_view(person_id));
drop policy if exists "issued_policy: write" on issued_policy;
create policy "issued_policy: write" on issued_policy for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "deposit: read" on deposit;
create policy "deposit: read" on deposit for select using (can_view(person_id));
drop policy if exists "deposit: write" on deposit;
create policy "deposit: write" on deposit for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());

drop policy if exists "tracker_entry: read" on tracker_entry;
create policy "tracker_entry: read" on tracker_entry for select using (can_view(person_id));
drop policy if exists "tracker_entry: write" on tracker_entry;
create policy "tracker_entry: write" on tracker_entry for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());


-- Sample producer sales-tracking data so the dashboard chart + analytics view
-- render real numbers. Seeds ~12 weeks of activity for ONE producer.
--
-- Target selection (in order):
--   1. An explicit email, if you uncomment + set v_pid below.
--   2. Otherwise the first signed-in (auth-linked) person — i.e. whoever has
--      actually logged in. This is the account that will view /producer.
--   3. Otherwise the oldest person row.
-- Re-running is safe: it skips if the target already has tracker_entry rows.

do $$
declare
  v_pid uuid;
begin
  -- To pin the seed to a specific account, uncomment and set the email:
  -- select id into v_pid from person where lower(email) = lower('you@example.com');

  if v_pid is null then
    select id into v_pid from person
     where auth_user_id is not null
     order by created_at asc
     limit 1;
  end if;

  if v_pid is null then
    select id into v_pid from person order by created_at asc limit 1;
  end if;

  if v_pid is null then
    raise notice 'No person rows found; skipping producer seed.';
    return;
  end if;

  if exists (select 1 from tracker_entry where person_id = v_pid) then
    raise notice 'Producer seed already present for %, skipping.', v_pid;
    return;
  end if;

  raise notice 'Seeding producer sales data for person %', v_pid;

  -- Leads: ~600 over the last 84 days, spread across states + age bands 50-80.
  insert into sales_lead (person_id, first_name, last_name, state, age, received_at)
  select
    v_pid,
    'Lead',
    g::text,
    (array['TX','FL','CA','GA','NC','OH','PA','AZ','TN','MI','NY','IL','MO','AL','SC','VA','IN','KY','LA','OK'])[(1 + floor(random() * 20))::int],
    (50 + floor(random() * 31))::int,
    now() - (random() * 84 || ' days')::interval
  from generate_series(1, 600) g;

  -- Per-weekday activity totals (Tracker). Powers the funnel + dashboard series.
  insert into tracker_entry (person_id, entry_date, dials, contacts, appointments, presentations, sales)
  select
    v_pid,
    d::date,
    (80 + floor(random() * 70))::int,
    (28 + floor(random() * 30))::int,
    (6 + floor(random() * 10))::int,
    (4 + floor(random() * 7))::int,
    (1 + floor(random() * 3))::int
  from generate_series(current_date - 84, current_date, interval '1 day') d
  where extract(dow from d) not in (0, 6)
  on conflict (person_id, entry_date) do nothing;

  -- Sales: ~45 closed sales tied to random leads.
  insert into sale (
    person_id, lead_id, carrier,
    face_amount_cents, monthly_premium_cents, annual_premium_cents,
    effective_date, created_at
  )
  select
    v_pid,
    l.id,
    (array['Mutual of Omaha','Americo','Foresters','GTL','Aetna','Transamerica','CoreBridge','Royal Neighbors'])[(1 + floor(random() * 8))::int],
    (1000000 + floor(random() * 1500000))::int,
    m.monthly,
    m.monthly * 12,
    (current_date - floor(random() * 84)::int),
    now() - (random() * 84 || ' days')::interval
  from generate_series(1, 45) g
  cross join lateral (
    select id from sales_lead where person_id = v_pid order by random() limit 1
  ) l
  cross join lateral (
    select (4000 + floor(random() * 8000))::int as monthly
  ) m;

  -- Issued policies: ~72% of sales get issued (a few lapse).
  insert into issued_policy (person_id, sale_id, status, issued_at)
  select
    v_pid,
    s.id,
    case when random() < 0.92 then 'issued' else 'lapsed' end,
    s.created_at + (random() * 10 || ' days')::interval
  from sale s
  where s.person_id = v_pid and random() < 0.72;

  -- Deposits: one received deposit per issued policy (the monthly premium).
  insert into deposit (person_id, policy_id, amount_cents, status, received_at)
  select
    v_pid,
    p.id,
    sa.monthly_premium_cents,
    'received',
    p.issued_at + interval '2 days'
  from issued_policy p
  join sale sa on sa.id = p.sale_id
  where p.person_id = v_pid and p.status = 'issued';

  -- Contact attempts: ~1500, spread across weekday business hours 8-19.
  -- Powers the 7x12 contact heatmap on the analytics Performance section.
  insert into contact_attempt (person_id, lead_id, outcome, created_at)
  select
    v_pid,
    l.id,
    (array['connected','voicemail','no_answer','no_answer','connected','callback','wrong_number'])[(1 + floor(random() * 7))::int],
    (current_date - floor(random() * 84)::int)::timestamptz
      + ((8 + floor(random() * 12)) || ' hours')::interval
      + (floor(random() * 60) || ' minutes')::interval
  from generate_series(1, 1500) g
  cross join lateral (
    select id from sales_lead where person_id = v_pid order by random() limit 1
  ) l;

  raise notice 'Producer seed complete for person %', v_pid;
end $$;


-- daily_projection: a producer's self-set targets for a single day.
-- The producer fills in how many dials/contacts/appointments/presentations/
-- sales they intend to do today plus the AP they intend to submit; the
-- dashboard then renders progress bars of today's ACTUALS (from tracker_entry
-- and sale) against these projections.
--
-- Scoped to a single person_id, mirroring tracker_entry: read = can_view()
-- (self + downline + owner), write = self only via auth_person_id().

create table if not exists daily_projection (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  entry_date date not null,
  dials integer not null default 0 check (dials >= 0),
  contacts integer not null default 0 check (contacts >= 0),
  appointments integer not null default 0 check (appointments >= 0),
  presentations integer not null default 0 check (presentations >= 0),
  sales integer not null default 0 check (sales >= 0),
  ap_cents integer not null default 0 check (ap_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, entry_date)
);
create index if not exists daily_projection_person_date_idx
  on daily_projection(person_id, entry_date desc);

drop trigger if exists daily_projection_updated_at on daily_projection;
create trigger daily_projection_updated_at
  before update on daily_projection
  for each row execute function set_updated_at();

alter table daily_projection enable row level security;

drop policy if exists "daily_projection: read" on daily_projection;
create policy "daily_projection: read" on daily_projection for select using (can_view(person_id));
drop policy if exists "daily_projection: write" on daily_projection;
create policy "daily_projection: write" on daily_projection for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());


-- producer_goal: a producer's standing goals (no period reset). One row per
-- person. The dashboard renders month-to-date actuals (AP / IP / sales) as
-- progress against these targets. Producers edit their own goal in Settings.
--
-- Scoped to a single person_id, mirroring tracker_entry / daily_projection:
-- read = can_view() (self + downline + owner), write = self via auth_person_id().

create table if not exists producer_goal (
  person_id uuid primary key references person(id) on delete cascade,
  ap_cents integer not null default 0 check (ap_cents >= 0),
  ip_cents integer not null default 0 check (ip_cents >= 0),
  sales integer not null default 0 check (sales >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists producer_goal_updated_at on producer_goal;
create trigger producer_goal_updated_at
  before update on producer_goal
  for each row execute function set_updated_at();

alter table producer_goal enable row level security;

drop policy if exists "producer_goal: read" on producer_goal;
create policy "producer_goal: read" on producer_goal for select using (can_view(person_id));
drop policy if exists "producer_goal: write" on producer_goal;
create policy "producer_goal: write" on producer_goal for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());
