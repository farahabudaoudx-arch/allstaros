-- AI conversation log (PRE_LAUNCH_ROADMAP §1 #9).
--
-- Stores the question + answer for the Sidekick coaching assistant ONLY, so an
-- off-compliance or wrong answer (e.g. the AI coaxed into recommending term
-- life, or giving regulatory advice) leaves a reviewable record.
--
-- The Underwriting Wizard is DELIBERATELY EXCLUDED: its input is the client's
-- raw medical notes (PII), and the decision (roadmap §1 #9) is not to store that.
-- Underwriting still records cost/usage metadata in ai_usage_log — just no text.
--
-- Kept separate from ai_usage_log so this free-text can be purged on its own
-- retention schedule without touching the cost/rate-limit ledger.

create table if not exists ai_conversation_log (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  tool text not null,                          -- 'sidekick' (only producer of rows today)
  question text not null,
  answer text not null,
  redirected boolean not null default false,   -- true = sent to the Underwriting Wizard, no model answer
  created_at timestamptz not null default now()
);

create index if not exists ai_conversation_log_person_created_idx
  on ai_conversation_log(person_id, created_at desc);
create index if not exists ai_conversation_log_created_idx
  on ai_conversation_log(created_at desc);

alter table ai_conversation_log enable row level security;

-- Compliance review is an admin function. Inserts happen via the service role,
-- so there is no insert policy.
drop policy if exists "ai_conversation_log: admin read" on ai_conversation_log;
create policy "ai_conversation_log: admin read" on ai_conversation_log
  for select to authenticated using (is_admin());
