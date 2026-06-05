import Anthropic from "@anthropic-ai/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  getConditionsForToolkit,
  lookupCarrierOutcomes,
} from "@/lib/underwriting/data";
import { analyzeNotes, buildRulesContext } from "@/lib/underwriting/llm";
import type { Toolkit } from "@/lib/underwriting/types";

// Answers come from Haiku (fast/cheap), matching the in-portal help assistant.
const MODEL = "claude-haiku-4-5-20251001";
const EMBED_MODEL = "text-embedding-3-small";

// Retrieval tuning.
const MATCH_COUNT = 12; // pull this many question-vectors before dedupe
const MIN_SIMILARITY = 0.3; // drop anything less related than this
const MAX_CHUNKS = 6; // distinct answers handed to Claude

const SYSTEM_PROMPT = `You are All Star AI — the team's knowledge assistant for life-insurance agents. You're trained on All Star's own training library (sales, objection handling, scripts, recruiting, products, mindset, and more) AND on All Star's carrier underwriting matrix (which health conditions get approved, by carrier, for the products All Star sells).

You answer using ONLY the CONTEXT provided below (excerpts retrieved for this question). Rules:
- Ground every claim in the CONTEXT. Do not invent numbers, scripts, carriers, or tactics that aren't there.
- If the CONTEXT doesn't actually cover the question, say so plainly and suggest they rephrase or ask their builder — do not guess.
- Be direct and practical. Use short paragraphs or tight bullets, whatever fits the question.
- When the context gives a script or specific numbers, quote them concretely.
- You are not giving licensed compliance/regulatory advice; for that, defer to a human.

UNDERWRITING / APPROVALS:
When the CONTEXT includes an "UNDERWRITING APPROVAL RULES" section, the agent is asking what a client can be approved for based on their health conditions. Answer ONLY from those rules. Outcomes mean:
- Approved = the carrier will issue (instant / standard). Lead with these — they're the best options.
- Graded = modified or guaranteed-issue coverage (graded death benefit, usually a 2-3 year waiting period). Offer as a fallback.
- Conditional = depends on timing or severity. Tell the agent exactly what to confirm with the client (e.g. "if treated within 1 year, decline").
- Decline = the carrier won't write it.
- Unknown = no published rule for this condition — tell the agent to research it, don't assume approval.
Lead with the Approved carriers first, then Graded fallbacks, then flag the Conditional rules and what to ask. These outcomes are for the carriers All Star actually sells; treat them as authoritative. If multiple conditions are present, a carrier is only as good as its worst outcome across them.

Speak in second person ("you"). No preamble, no "based on the context" throat-clearing — just answer.`;

export type CoachSource = {
  chunk_id: number;
  topic: string;
  cluster: string;
  similarity: number;
};

export type CoachResult =
  | { ok: true; answer: string; sources: CoachSource[] }
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

// ─── Underwriting (carrier-approval) lookup ──────────────────────────────────
// The underwriting wizard's carrier matrix lives in a static JSON (287
// conditions × carriers × outcomes). Rather than re-embed that structured grid
// into the vector store — semantic search is bad at "list every carrier for
// diabetes" — we reuse the wizard's own condition extractor + lookup and inject
// the authoritative rules straight into the coach's CONTEXT.

const TOOLKITS: Toolkit[] = ["FEX", "SIUL"];
const TOOLKIT_LABEL: Record<Toolkit, string> = {
  FEX: "FEX (Final Expense)",
  SIUL: "SIUL (Simplified IUL)",
};

// Cheap gate so pure sales questions don't pay for an extra extraction call.
// Biased toward triggering — a false positive just returns no conditions.
// Two signals fire it: (1) approval/placement intent words, or (2) the question
// names an actual condition from the matrix (see mentionsCondition below).
const UW_INTENT =
  /\b(approv|declin|graded|qualif|eligib|underwrit|carrier|insurab|coverage|covered|placement|\brated\b|guaranteed issue|\bgi\b|final expense|\biul\b|\bfex\b|\bsiul\b|which carrier|what can .* get|(?:who|where) (?:should|can|do|will|would) i (?:write|place|put|send)|write (?:them|him|her|this|the client)|place (?:them|him|her|this|the client)|who (?:will |can |would )?(?:approve|write|cover|take))/i;

// Generic words that appear inside condition names but aren't disease-specific —
// excluded so "history of the company" or "what type of lead" don't trip the gate.
const COND_STOPWORDS = new Set([
  "with", "without", "other", "current", "currently", "recent", "past", "history",
  "chronic", "acute", "disease", "diseases", "disorder", "disorders", "syndrome",
  "condition", "conditions", "complication", "complications", "type", "level",
  "severe", "moderate", "mild", "including", "excluding", "cell", "general",
  "status", "primary", "secondary", "related", "activities", "daily", "living",
  "care", "within", "year", "years", "disability", "high", "low", "loss",
  "back", "weight",
]);

// Disease-specific keywords harvested from the 287 canonical condition names,
// so naming any condition (e.g. "diabetes", "COPD") trips the gate — no
// hand-maintained word list, it tracks the data.
let conditionKeywordsCache: Set<string> | null = null;
function conditionKeywords(): Set<string> {
  if (conditionKeywordsCache) return conditionKeywordsCache;
  const set = new Set<string>();
  for (const c of canonicalUnion()) {
    for (const tok of c.condition.toLowerCase().split(/[^a-z]+/)) {
      if (tok.length >= 4 && !COND_STOPWORDS.has(tok)) set.add(tok);
    }
  }
  conditionKeywordsCache = set;
  return set;
}

function mentionsCondition(q: string): boolean {
  const kw = conditionKeywords();
  return q
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((w) => w.length >= 4 && kw.has(w));
}

function isUnderwritingIntent(q: string): boolean {
  return UW_INTENT.test(q) || mentionsCondition(q);
}

// Union of both toolkits' canonical condition lists, used to constrain the
// extractor to real condition names. Static data, so build once.
let canonicalUnionCache: Array<{ condition: string; category: string }> | null = null;
function canonicalUnion(): Array<{ condition: string; category: string }> {
  if (canonicalUnionCache) return canonicalUnionCache;
  const seen = new Set<string>();
  const out: Array<{ condition: string; category: string }> = [];
  for (const tk of TOOLKITS) {
    for (const c of getConditionsForToolkit(tk)) {
      if (seen.has(c.condition)) continue;
      seen.add(c.condition);
      out.push(c);
    }
  }
  canonicalUnionCache = out;
  return out;
}

type UnderwritingContext = { text: string; conditions: string[] };

/** If the question is an approval question, extract conditions and build the
 *  carrier-rules block for both toolkits. Returns null when not applicable. */
async function underwritingContext(question: string): Promise<UnderwritingContext | null> {
  if (!isUnderwritingIntent(question)) return null;

  let conditions: string[];
  try {
    const res = await analyzeNotes({
      text: question,
      toolkit: "FEX and SIUL",
      canonicalConditions: canonicalUnion(),
    });
    conditions = res.conditions;
  } catch {
    return null; // never let an underwriting hiccup break the main answer
  }
  if (conditions.length === 0) return null;

  const blocks: string[] = [];
  for (const tk of TOOLKITS) {
    const results = lookupCarrierOutcomes(tk, conditions);
    if (results.length === 0) continue;
    blocks.push(`#### ${TOOLKIT_LABEL[tk]}\n${buildRulesContext(results)}`);
  }
  if (blocks.length === 0) return null;

  return { text: blocks.join("\n\n"), conditions };
}

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

  // Vector retrieval and the underwriting lookup are independent — run together.
  let chunks: MatchRow[];
  let uw: UnderwritingContext | null;
  try {
    [chunks, uw] = await Promise.all([
      retrieve(input.question),
      underwritingContext(input.question),
    ]);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "retrieval failed" };
  }

  const libraryContext =
    chunks.length === 0
      ? "(no relevant excerpts found in the training library)"
      : chunks
          .map((c, i) => `[${i + 1}] (${c.topic})\n${c.answer}`)
          .join("\n\n");

  const sections: string[] = [];
  if (uw) {
    sections.push(
      `UNDERWRITING APPROVAL RULES (carriers All Star sells — what this client can be approved for, by toolkit):\n\n${uw.text}`,
    );
  }
  sections.push(`TRAINING LIBRARY EXCERPTS:\n${libraryContext}`);
  const context = sections.join("\n\n");

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

    // Matched underwriting conditions surface as source chips too (negative
    // chunk_ids keep their keys distinct from the vector-store rows).
    const uwSources: CoachSource[] = uw
      ? uw.conditions.map((cond, i) => ({
          chunk_id: -1 - i,
          topic: cond,
          cluster: "Underwriting matrix",
          similarity: 1,
        }))
      : [];

    const sources: CoachSource[] = [
      ...uwSources,
      ...chunks.map((c) => ({
        chunk_id: c.chunk_id,
        topic: c.topic,
        cluster: c.cluster,
        similarity: c.similarity,
      })),
    ];

    return { ok: true, answer: answer || "(empty response)", sources };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "generation failed" };
  }
}
