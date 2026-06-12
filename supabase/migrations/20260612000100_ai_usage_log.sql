-- AI usage ledger + rate-limit source of truth (PRE_LAUNCH_ROADMAP §1 #8).
-- One row per LLM-backed AI call: who (person), which tool, the model, token
-- counts, and an estimated cost. The per-user daily + burst caps are computed by
-- counting rows here (see src/lib/ai/usage.ts) — keeping enforcement consistent
-- across Vercel's many serverless instances (in-memory counters can't).
--
-- It also turns the §3 cost estimate into real, queryable data, and is the
-- foundation the §1 #9 AI-conversation log will extend (prompt/response columns).
--
-- Rows are written server-side via the service role (no client insert path).
-- Reads follow the same visibility as the rest of the app: your own rows, and
-- your downline's if you're a builder/admin (via can_view).

create table if not exists ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  tool text not null,                 -- 'sidekick' | 'underwriting_analyze' | 'underwriting_chat'
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  est_cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);

-- The hot path is "count this person's rows since <time>, optionally for a tool".
create index if not exists ai_usage_log_person_created_idx
  on ai_usage_log(person_id, created_at desc);

alter table ai_usage_log enable row level security;

-- Read your own usage (and your downline's, for builders/admins via can_view).
-- Inserts happen via the service role, so there is no insert policy.
drop policy if exists "ai_usage_log: read own/downline" on ai_usage_log;
create policy "ai_usage_log: read own/downline" on ai_usage_log
  for select to authenticated using (can_view(person_id));
