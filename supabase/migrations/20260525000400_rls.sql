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
