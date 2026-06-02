-- Section 3.3 acceptance seed: 3 levels deep + a parallel team.
-- Run AFTER migrations against a clean dev project.
-- Then run the verification block at the bottom to confirm the visibility rule.
--
--   Hierarchy:
--     alice (root, builder)
--     ├── bob       (builder, under alice)
--     │   └── charlie  (builder, under bob)
--     │        └── daria  (recruit, under charlie)
--     └── eve        (builder, under alice; parallel to bob)
--          └── frank   (recruit, under eve)

-- Idempotent: wipe seed rows first.
delete from policy_submission where recruit_id in (select id from recruit);
delete from milestone where recruit_id in (select id from recruit);
delete from message where recruit_id in (select id from recruit);
delete from check_in where recruit_id in (select id from recruit);
delete from lesson_completion where recruit_id in (select id from recruit);
delete from recruit;
delete from person where email like '%@example.test';

-- Persons. Note auth_user_id is filled in only when a Supabase auth user exists;
-- the verification block below uses set_config to simulate auth.uid().
insert into person (id, full_name, email, upline_id, is_builder, auth_user_id) values
  ('11111111-1111-1111-1111-111111111111', 'Alice Root',    'alice@example.test',   null,                                   true, '11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222', 'Bob Branch',    'bob@example.test',     '11111111-1111-1111-1111-111111111111', true, '22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333', 'Charlie Coach', 'charlie@example.test', '22222222-2222-2222-2222-222222222222', true, '33333333-3333-3333-3333-333333333333'),
  ('44444444-4444-4444-4444-444444444444', 'Daria Drive',   'daria@example.test',   '33333333-3333-3333-3333-333333333333', false,'44444444-4444-4444-4444-444444444444'),
  ('55555555-5555-5555-5555-555555555555', 'Eve Edge',      'eve@example.test',     '11111111-1111-1111-1111-111111111111', true, '55555555-5555-5555-5555-555555555555'),
  ('66666666-6666-6666-6666-666666666666', 'Frank Forge',   'frank@example.test',   '55555555-5555-5555-5555-555555555555', false,'66666666-6666-6666-6666-666666666666');

insert into recruit (id, person_id, builder_id, phase) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'licensing'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'licensing');

-- Training placeholders (Section 4.6).
insert into training_lesson (title, phase, sort_order, is_assignment) values
  ('Licensing — Course intro',     'licensing', 0, false),
  ('Licensing — Test prep block',  'licensing', 1, false),
  ('Licensing — Final review',     'licensing', 2, true),
  ('Onboarding — Carrier overview','onboarding', 0, false),
  ('Onboarding — Phone scripts',   'onboarding', 1, false),
  ('Onboarding — Roleplay prep',   'onboarding', 2, true)
on conflict do nothing;

insert into motivational_video (title, sort_order) values
  ('Case study — first $20k month', 0),
  ('Interview — top-of-team agent', 1)
on conflict do nothing;

-- ============================================================
-- VERIFICATION — run interactively as the postgres superuser.
-- Each block simulates a user by setting the JWT subject claim, then queries.
-- can_view(target) reads auth.uid() via auth_person_id().
-- ============================================================
--
-- -- Bob should see Bob, Charlie, Daria (3 rows from person):
-- set local role authenticated;
-- set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
-- select full_name from person order by full_name;
-- -- expect: Bob Branch, Charlie Coach, Daria Drive
--
-- -- Bob should NOT see Eve or Frank (parallel team) or Alice (upline):
-- select full_name from person where full_name in ('Alice Root','Eve Edge','Frank Forge');
-- -- expect: 0 rows
--
-- -- Daria sees only herself:
-- set local "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
-- select full_name from person;
-- -- expect: Daria Drive only
--
-- -- Daria sees only her own recruit row:
-- select id from recruit;
-- -- expect: aaaaaaaa-...
--
-- reset role;
