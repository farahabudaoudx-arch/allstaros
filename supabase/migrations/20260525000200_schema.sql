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
