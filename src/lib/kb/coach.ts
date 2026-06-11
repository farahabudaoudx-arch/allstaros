import Anthropic from "@anthropic-ai/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Answers come from Haiku (fast/cheap), matching the in-portal help assistant.
const MODEL = "claude-haiku-4-5-20251001";
const EMBED_MODEL = "text-embedding-3-small";

// Retrieval tuning.
const MATCH_COUNT = 12; // pull this many question-vectors before dedupe
const MIN_SIMILARITY = 0.3; // drop anything less related than this
const MAX_CHUNKS = 6; // distinct answers handed to Claude

const SYSTEM_PROMPT = `You are All Star AI — the team's knowledge assistant for life-insurance agents and recruits. You're trained on All Star's own training library: sales, objection handling, scripts, recruiting, onboarding/licensing, products, mindset, and the state licensing-exam material.

You answer using ONLY the CONTEXT provided below (excerpts retrieved for this question). Rules:
- Ground every claim in the CONTEXT. Do not invent numbers, scripts, carriers, or tactics that aren't there.
- If the CONTEXT doesn't actually cover the question, say so plainly and suggest they rephrase or ask their builder — do not guess.
- Be direct and practical. Use short paragraphs or tight bullets, whatever fits the question.
- When the context gives a script or specific numbers, quote them concretely.
- You are not giving licensed compliance/regulatory advice; for that, defer to a human.

PRODUCT SCOPE (firm business rule — overrides the CONTEXT, no exceptions):
All Star agents sell WHOLE LIFE and INDEXED UNIVERSAL LIFE (IUL), plus certain riders. All Star does NOT sell term life, standalone universal life, or annuities — and a MEC (Modified Endowment Contract) is a tax pitfall to avoid, not a product to sell.
- NEVER suggest, recommend, or coach an agent to sell term life — not as a default, not as a fallback, not as a "last resort," not "to save the sale," not for price-sensitive clients, not in any situation whatsoever. There is no exception.
- Some older training excerpts in the CONTEXT say to sell a term policy in certain cases. That guidance is OUT OF SCOPE — ignore it completely and do not repeat it, even to caveat it. This rule wins over any conflicting excerpt.
- When an agent asks whether to sell term, universal life, or annuities, the answer is simply no — All Star sells whole life and IUL. Then redirect them to how to position or close whole life / IUL instead (e.g. for a price-sensitive client, how to frame permanent coverage or adjust face amount — never term).
- You MAY still explain how term, universal life, annuities, MECs, group life, etc. work when asked, because agents must learn them to PASS THE STATE EXAM — but frame it strictly as exam/product knowledge, never as something to sell.

Speak in second person ("you"). No preamble, no "based on the context" throat-clearing — just answer.`;

export type CoachSource = {
  chunk_id: number;
  topic: string;
  cluster: string;
  similarity: number;
};

export type CoachResult =
  | { ok: true; answer: string; sources: CoachSource[]; underwriting?: boolean }
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
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, error: "OPENAI_API_KEY is not set on the server." };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not set on the server." };
  }

  // Medical-underwriting questions go to the Underwriting Wizard, not the KB.
  // Short-circuit before any retrieval/generation — no model call needed.
  if (isUnderwritingQuestion(input.question)) {
    return { ok: true, answer: UNDERWRITING_REDIRECT, sources: [], underwriting: true };
  }

  let chunks: MatchRow[];
  try {
    chunks = await retrieve(input.question);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "retrieval failed" };
  }

  const context =
    chunks.length === 0
      ? "(no relevant excerpts found in the training library)"
      : chunks
          .map((c, i) => `[${i + 1}] (${c.topic})\n${c.answer}`)
          .join("\n\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: `CONTEXT:\n${context}` },
      ],
      messages: [
        ...input.history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: input.question },
      ],
    });

    const answer = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const sources: CoachSource[] = chunks.map((c) => ({
      chunk_id: c.chunk_id,
      topic: c.topic,
      cluster: c.cluster,
      similarity: c.similarity,
    }));

    return { ok: true, answer: answer || "(empty response)", sources };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "generation failed" };
  }
}
