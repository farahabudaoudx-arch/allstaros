// Per-user AI usage cap + cost ledger (PRE_LAUNCH_ROADMAP §1 #8).
//
// Three free-text AI chats call paid APIs (Anthropic + OpenAI). With 100 users
// arriving at once, one heavy user — or a runaway loop/bug — could hammer them
// and run up a surprise bill. This module enforces a per-user cap and records
// what every call actually spent.
//
// Backed by the `ai_usage_log` table (counting rows works across Vercel's many
// serverless instances; in-memory counters don't). It is deliberately
// FAIL-OPEN: if the table is missing or a query errors, calls are ALLOWED. A
// rate limiter must never take the feature down — the cap is a guardrail, not a
// gate. (So if this ships before the migration is applied, AI keeps working and
// the cap simply stays dormant until the table exists.)

import { createServiceRoleClient } from "@/lib/supabase/server";

export type AiTool = "sidekick" | "underwriting_analyze" | "underwriting_chat";

// Per-user DAILY caps (UTC day). Generous for genuine use — these exist to stop
// a runaway loop or a single abusive user, not to ration normal work. Tune here.
const DAILY_LIMIT: Record<AiTool, number> = {
  sidekick: 120, // Haiku — cheap; this is an abuse ceiling
  underwriting_analyze: 60, // Haiku — 1 model call per request
  underwriting_chat: 60, // Haiku — 2 model calls per request
};

// Short-window BURST cap across ALL tools for one user — catches a tight loop
// fast, well before the daily cap would.
const BURST_LIMIT = 20; // requests
const BURST_WINDOW_SECONDS = 60;

// Model pricing, USD per 1M tokens (input / output). Matches roadmap §3.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-opus-4-7": { in: 5, out: 25 },
};

export type Usage = {
  inputTokens: number; // fresh (non-cached) input tokens
  outputTokens: number;
  cacheReadTokens?: number; // cached input reads (billed at ~0.1x)
};

/** Rough USD cost of one call, for the ledger. Unknown model → 0. */
export function estimateCostUsd(model: string, u: Usage): number {
  const p = PRICING[model];
  if (!p) return 0;
  const cached = u.cacheReadTokens ?? 0;
  return (u.inputTokens * p.in + cached * p.in * 0.1 + u.outputTokens * p.out) / 1_000_000;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterSeconds: number };

/** Check (don't record) whether this user may make another `tool` call now. */
export async function checkAiRateLimit(
  personId: string,
  tool: AiTool,
  signal?: AbortSignal,
): Promise<RateLimitResult> {
  try {
    const admin = createServiceRoleClient();
    const now = Date.now();
    const windowStart = new Date(now - BURST_WINDOW_SECONDS * 1000).toISOString();
    const dayStart = new Date().toISOString().slice(0, 10) + "T00:00:00Z";

    // Burst: this user's calls across ALL tools in the last minute.
    const burstQuery = admin
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("person_id", personId)
      .gte("created_at", windowStart);
    const burst = await (signal ? burstQuery.abortSignal(signal) : burstQuery);
    if (burst.error) throw burst.error;
    if ((burst.count ?? 0) >= BURST_LIMIT) {
      return {
        allowed: false,
        reason: "You're sending requests very quickly — give it a few seconds and try again.",
        retryAfterSeconds: BURST_WINDOW_SECONDS,
      };
    }

    // Daily: this user's calls for THIS tool today (UTC).
    const dailyQuery = admin
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("person_id", personId)
      .eq("tool", tool)
      .gte("created_at", dayStart);
    const daily = await (signal ? dailyQuery.abortSignal(signal) : dailyQuery);
    if (daily.error) throw daily.error;
    if ((daily.count ?? 0) >= DAILY_LIMIT[tool]) {
      return {
        allowed: false,
        reason: "You've reached today's limit for this assistant. It resets tomorrow.",
        retryAfterSeconds: 0,
      };
    }

    return { allowed: true };
  } catch (err) {
    // Fail open — never let the limiter take the assistant down.
    console.error("[ai/usage] rate-limit check failed (allowing request):", err);
    return { allowed: true };
  }
}

/** Record one completed call. Best-effort — never throws into the request. */
export async function recordAiUsage(args: {
  personId: string;
  tool: AiTool;
  model: string;
  usage: Usage;
  signal?: AbortSignal;
}): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    const query = admin.from("ai_usage_log").insert({
      person_id: args.personId,
      tool: args.tool,
      model: args.model,
      input_tokens: args.usage.inputTokens,
      output_tokens: args.usage.outputTokens,
      cache_read_tokens: args.usage.cacheReadTokens ?? 0,
      est_cost_usd: estimateCostUsd(args.model, args.usage),
    });
    const { error } = await (args.signal ? query.abortSignal(args.signal) : query);
    if (error) throw error;
  } catch (err) {
    console.error("[ai/usage] failed to record usage (ignored):", err);
  }
}
