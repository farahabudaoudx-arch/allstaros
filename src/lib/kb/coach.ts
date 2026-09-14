import { createServiceRoleClient } from "@/lib/supabase/server";
import { getInstallationConfig } from "@/lib/installation/config";
import {
  DEFAULT_STANDARD_COACH_MODEL,
  generateStandardCoachResponse,
} from "@/lib/services/ai/generation";
import type { Usage } from "@/lib/ai/usage";

// Exported so the API route can attribute usage to the right model.
export const SIDEKICK_MODEL = DEFAULT_STANDARD_COACH_MODEL;
const EMBED_MODEL = "text-embedding-3-small";

// Retrieval tuning.
const MATCH_COUNT = 12; // pull this many question-vectors before dedupe
const MIN_SIMILARITY = 0.3; // drop anything less related than this
const MAX_CHUNKS = 6; // distinct answers handed to Claude

function standardSystemPrompt(shortName: string): string {
  return `You are ${shortName} Sidekick — the installation's included standard AI coach for life-insurance agents and recruits.

This is the STANDARD coach profile. It is not trained on this customer's uploaded training library and must never claim that it is. Be direct and practical. Use short paragraphs or tight bullets. Do not invent carrier rules, organization-specific quotas, compensation values, or internal policies. When a question depends on a company-specific rule you were not given, say so and direct the user to their builder/admin.

You are not giving licensed compliance/regulatory advice; for that, defer to a qualified human.

PRODUCT SCOPE (firm standard-profile rule):
The standard methodology focuses on WHOLE LIFE and INDEXED UNIVERSAL LIFE (IUL), plus certain riders. Do not coach the user to sell term life, standalone universal life, or annuities. A MEC (Modified Endowment Contract) is a tax pitfall to avoid, not a product to sell.
- NEVER suggest, recommend, or coach an agent to sell term life — not as a default, not as a fallback, not as a "last resort," not "to save the sale," not for price-sensitive clients, not in any situation whatsoever. There is no exception.
- When an agent asks whether to sell term, universal life, or annuities, redirect them to how to position or close whole life / IUL instead.
- You MAY still explain how term, universal life, annuities, MECs, group life, etc. work when asked, because agents must learn them to PASS THE STATE EXAM — but frame it strictly as exam/product knowledge, never as something to sell.

CLOSE ON THIS CALL — NEVER SCHEDULE A FOLLOW-UP:
The standard profile coaches toward resolving the decision on the SAME call. Do not tell an agent to schedule a follow-up appointment or callback as the sales strategy. Getting a decision-maker onto the current call is fine.

Speak in second person ("you"). No preamble — just answer.`;
}

function customSystemPrompt(shortName: string, chunks: MatchRow[]): string {
  return `${standardSystemPrompt(shortName)}

CUSTOM COACH MODE: answer using ONLY the customer-provided CONTEXT below. Ground every organization-specific claim in it. If the context does not cover the question, say so plainly instead of guessing.

CONTEXT:
${chunks.map((chunk, index) => `[${index + 1}] (${chunk.topic})\n${chunk.answer}`).join("\n\n")}`;
}

export type CoachSource = {
  chunk_id: number;
  topic: string;
  cluster: string;
  similarity: number;
};

export type CoachResult =
  | { ok: true; answer: string; sources: CoachSource[]; underwriting?: boolean; usage?: Usage; model?: string }
  | { ok: false; error: string };

type MatchRow = {
  id: string;
  chunk_id: number;
  question: string;
  answer: string;
  topic: string;
  cluster: string;
  similarity: number;
};

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0].embedding;
}

/** Embed the question, find nearest Q&A rows, dedupe to distinct answers. */
async function retrieve(question: string): Promise<MatchRow[]> {
  const queryEmbedding = await embed(question);
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("match_kb_documents", {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
    similarity_threshold: MIN_SIMILARITY,
  });
  if (error) throw new Error(`match_kb_documents: ${error.message}`);

  const rows = (data ?? []) as MatchRow[];
  // Rows arrive best-first; keep one row per chunk_id (the multi-vector collapse).
  const seen = new Set<number>();
  const unique: MatchRow[] = [];
  for (const r of rows) {
    if (seen.has(r.chunk_id)) continue;
    seen.add(r.chunk_id);
    unique.push(r);
    if (unique.length >= MAX_CHUNKS) break;
  }
  return unique;
}

// ─── Medical-underwriting redirect ───────────────────────────────────────────
// Carrier-approval-by-condition questions are handled by the dedicated
// Underwriting Wizard (its own structured carrier matrix), NOT by this chatbot.
// When a question shows medical-approval intent we short-circuit with a pointer
// + a button (rendered by the UI) instead of trying to answer it from the KB.
// The trigger is intentionally approval-focused, not "any condition mentioned",
// so sales/mindset questions that happen to name a condition (e.g. anxiety on
// calls) still get a normal answer.
const UNDERWRITING_INTENT =
  /\b(approv|declin|graded|qualif|eligib|underwrit|insurab|guaranteed issue|which carrier|what carrier|coverage for|get covered|\brated\b|placement|what can .* (?:get|qualify)|(?:who|where) (?:should|can|do|will|would) i (?:write|place|put|send)|write (?:them|him|her|this|the client)|place (?:them|him|her|this|the client)|who (?:will |can |would )?(?:approve|write|cover|take)|health condition|pre-?existing|medical (?:condition|history|question))/i;

function isUnderwritingQuestion(q: string): boolean {
  return UNDERWRITING_INTENT.test(q);
}

const UNDERWRITING_REDIRECT = `For medical underwriting — figuring out which carriers will approve a client based on their specific health conditions — use the **Underwriting Wizard**. It checks the exact condition against every carrier we sell and gives you the approved / graded / decline breakdown, which is far more precise than I can be here.

Open it with the button below.

(If you instead want help with *how to talk to a client about their health questions* on a call, just ask me that directly.)`;

export type CoachInput = {
  question: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

export async function askCoach(input: CoachInput): Promise<CoachResult> {
  // Medical-underwriting questions go to the Underwriting Wizard, not the KB.
  // Short-circuit before any retrieval/generation — no model call needed.
  if (isUnderwritingQuestion(input.question)) {
    return { ok: true, answer: UNDERWRITING_REDIRECT, sources: [], underwriting: true };
  }

  const installation = await getInstallationConfig();
  const customMode = process.env.INSTALLATION_COACH_MODE?.trim().toLowerCase() === "custom";

  let chunks: MatchRow[] = [];
  if (customMode) {
    if (!process.env.OPENAI_API_KEY) {
      return { ok: false, error: "Custom AI retrieval is not configured for this installation." };
    }
    try {
      chunks = await retrieve(input.question);
    } catch {
      return { ok: false, error: "Custom AI retrieval is unavailable. The coach will not answer as if it were grounded in customer materials." };
    }
    if (chunks.length === 0) {
      return { ok: false, error: "The custom coach could not find relevant customer material for that question." };
    }
  }

  const generated = await generateStandardCoachResponse({
    system: customMode
      ? customSystemPrompt(installation.shortName, chunks)
      : standardSystemPrompt(installation.shortName),
    messages: [
      ...input.history,
      { role: "user", content: input.question },
    ],
  });
  if (!generated.ok) return generated;

  const sources: CoachSource[] = customMode
    ? chunks.map((chunk) => ({
        chunk_id: chunk.chunk_id,
        topic: chunk.topic,
        cluster: chunk.cluster,
        similarity: chunk.similarity,
      }))
    : [];
  return {
    ok: true,
    answer: generated.text,
    sources,
    usage: generated.usage,
    model: generated.model,
  };
}
