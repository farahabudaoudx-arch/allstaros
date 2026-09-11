// Anthropic wrapper for the underwriting wizard. Structured calls
// (extractConditions, analyzeNotes) use forced tool use to guarantee
// schema-shaped JSON; generateChatResponse is a plain messages call.

import Anthropic from "@anthropic-ai/sdk";
import type { Usage } from "@/lib/ai/usage";

// Underwriting analyzer model. Switched from Opus 4.7 → Haiku 4.5 on 2026-06-22
// after a 120-case accuracy bench (scripts/underwriting-accuracy-test.mjs): Haiku
// matched/beat Opus on recall with zero critical misses at ~1/7th the cost and 3x
// the speed. Re-run that bench before changing this again.
const MODEL = "claude-haiku-4-5-20251001";
// Exported so the API routes can attribute usage to the right model.
export const UNDERWRITING_MODEL = MODEL;

type Role = "user" | "assistant";
type Message = { role: Role; content: string };

/** Map an Anthropic usage block to our ledger's Usage shape. */
function usageOf(u: Anthropic.Usage): Usage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
  };
}

/** Sum token usage across the multiple model calls a single request may make. */
export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
  };
}

type ExtractionShape = {
  conditions: string[];
  timings: Record<string, string>;
  medications: string[];
  severity: Record<string, string>;
};

const CONDITION_INFO_ITEM = {
  type: "object",
  properties: {
    condition: { type: "string" },
    info:      { type: "string" },
  },
  required: ["condition", "info"],
  additionalProperties: false,
} as const;

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    conditions:  { type: "array", items: { type: "string" } },
    timings:     { type: "array", items: CONDITION_INFO_ITEM },
    medications: { type: "array", items: { type: "string" } },
    severity:    { type: "array", items: CONDITION_INFO_ITEM },
  },
  required: ["conditions", "timings", "medications", "severity"],
  additionalProperties: false,
} as const;

const EXTRACTION_SYSTEM = `You are a life insurance underwriting assistant. Extract all health conditions mentioned in the agent's notes.

Return a JSON object with:
- conditions: array of condition names (use standard medical terms, e.g. "Diabetes", "COPD", "Atrial Fibrillation", "Heart Attack", "Cancer"). Prefer the exact condition phrasing that would appear in a carrier underwriting guide. Examples: "Diabetes - Type 2", "Heart Attack", "Atrial Fibrillation", "COPD", "Cancer - Breast".
- timings: array of { condition, info } objects, one entry per condition with timing info (e.g. [{"condition": "Heart Attack", "info": "3 years ago"}])
- medications: array of medications mentioned
- severity: array of { condition, info } objects, one entry per condition with severity notes (e.g. [{"condition": "Diabetes - Type 2", "info": "on insulin, A1C 8.4"}])

Only extract what is explicitly stated. Be concise with condition names. Omit timings/severity entries when there's nothing to say.`;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").replace(/\s+/g, "");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  _client = new Anthropic({ apiKey });
  return _client;
}

// Force the model to emit a single tool_use block whose input matches `schema`.
// Returns the parsed input object (or null if the model didn't call the tool).
async function structured(opts: {
  system: string | Anthropic.TextBlockParam[];
  messages: Message[];
  toolName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  requestOptions?: Anthropic.RequestOptions;
}): Promise<{ data: Record<string, unknown> | null; usage: Usage }> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    tools: [
      {
        name: opts.toolName,
        description: "Return the structured result.",
        input_schema: opts.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
    messages: opts.messages,
  }, opts.requestOptions);
  const block = res.content.find((b) => b.type === "tool_use");
  const data =
    block && block.type === "tool_use"
      ? (block.input as Record<string, unknown>)
      : null;
  return { data, usage: usageOf(res.usage) };
}

export type ExtractionResult = ExtractionShape & { usage: Usage };

export async function extractConditions(message: string): Promise<ExtractionResult> {
  const { data: parsed, usage } = await structured({
    system: EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: message }],
    toolName: "extracted_conditions",
    schema: EXTRACTION_SCHEMA,
    maxTokens: 1024,
  });

  if (!parsed) return { conditions: [], timings: {}, medications: [], severity: {}, usage };
  return {
    conditions: Array.isArray(parsed.conditions) ? (parsed.conditions as string[]) : [],
    timings: toRecord(parsed.timings),
    medications: Array.isArray(parsed.medications) ? (parsed.medications as string[]) : [],
    severity: toRecord(parsed.severity),
    usage,
  };
}

function toRecord(items: unknown): Record<string, string> {
  if (!Array.isArray(items)) return {};
  const out: Record<string, string> = {};
  for (const item of items) {
    if (item && typeof item === "object" && "condition" in item && "info" in item) {
      const k = String((item as any).condition ?? "").trim();
      const v = String((item as any).info ?? "").trim();
      if (k) out[k] = v;
    }
  }
  return out;
}

export async function generateChatResponse(opts: {
  toolkit: string;
  rulesContext: string;
  history: Message[];
  userMessage: string;
}): Promise<{ reply: string; usage: Usage }> {
  const system = `You are an expert life insurance underwriting assistant helping agents place clients with the right carrier.

You have access to underwriting rules for ${opts.toolkit} carriers. When analyzing a client:
1. Identify which carriers will Approve, Graded, or Decline based on their conditions
2. Lead with the BEST carrier options — what can get approved instantly
3. Flag any timing-dependent rules (⚡ Conditional) and what questions to ask
4. Suggest follow-up questions if key information is missing
5. Be concise and actionable — agents need quick answers on calls

${opts.rulesContext
  ? `Current carrier rules for this client's conditions:\n\n${opts.rulesContext}`
  : "No specific conditions matched in the database yet — ask the agent for more details about the client's health history."}

Format your response clearly with the best options first. Use plain language, not jargon.`;

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [
      ...opts.history,
      { role: "user", content: opts.userMessage },
    ],
  });

  const reply = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return {
    reply: reply || "I couldn't generate a response. Please try again.",
    usage: usageOf(res.usage),
  };
}

export function buildRulesContext(carrierResults: Array<{
  condition: string;
  category: string;
  carriers: Record<string, { outcome: string; rawInfo: string }>;
}>): string {
  return carrierResults
    .map((c) => {
      const lines = Object.entries(c.carriers)
        .map(([carrier, data]) => {
          const note = data.rawInfo && data.rawInfo !== data.outcome ? ` (${data.rawInfo})` : "";
          return `  - ${carrier}: ${data.outcome}${note}`;
        })
        .join("\n");
      return `**${c.condition}** (${c.category}):\n${lines}`;
    })
    .join("\n\n");
}

// ─── /api/underwriting/analyze ─────────────────────────────────────────────────
// Takes client notes + the full canonical condition list for a toolkit. The
// LLM picks the SPECIFIC conditions that apply and returns a clinical summary
// of its reasoning. Output condition names are guaranteed to be exact members
// of the input list (server-side post-filter drops any hallucinations).

const ANALYZE_SYSTEM = `You are a life insurance underwriting assistant. Given freeform client notes, identify which SPECIFIC underwriting conditions apply from the canonical list provided.

═══ MATCHING IS YOUR PRIMARY JOB ═══
The canonical list contains 287 entries. If the agent NAMES a condition in the notes (e.g. "has meningitis", "history of stroke", "COPD", "Parkinson's"), and any entry in the canonical list matches that name (exact match, case-insensitive, or close synonym like "Alzheimer's" → "Alzheimer's / Dementia"), you MUST include the matching canonical entry. Do not be over-cautious — under-matching is a worse error than over-matching, because if you miss a condition the wizard incorrectly tells the agent every carrier approves the client.

Examples of correct matching (canonical entry on the right):
- "has meningitis" → "Meningitis"
- "Parkinson's disease" → "Parkinson's Disease"
- "had a stroke 4 years ago" → "Stroke (Past)" or "Stroke (Recent)" depending on the canonical list
- "on dialysis" → "Kidney Failure / Dialysis" (or the closest canonical entry)
- "COPD" / "emphysema" / "chronic bronchitis" → "Chronic Obstructive Pulmonary Disease (COPD)"
- "atrial fibrillation" / "afib" → "Atrial Fibrillation"
- "has had a heart attack" / "MI in 2020" → look for "Heart Attack" or "Myocardial Infarction" rows

The canonical entries often spell out the full medical name with the abbreviation in parentheses (e.g. "Chronic Obstructive Pulmonary Disease (COPD)"). When the agent writes the abbreviation alone — COPD, MI, CHF, CABG, AFib, CAD — scan the canonical list for that abbreviation INSIDE parentheses, not as a standalone entry. Do not output the abbreviation alone unless the canonical list actually contains it that way.

CRITICAL RULES:
1. Match aggressively when a condition is named. Default to including matches; only omit if the notes truly don't describe that condition.
2. Pick the MOST SPECIFIC matching condition from the list. If multiple variants exist (Past vs Current, With Complications vs No Complications), use the notes to choose.
3. Use the EXACT condition name from the canonical list — do not paraphrase, do not invent.
4. If the agent describes a condition that genuinely has NO match in the canonical list, omit it from conditions[] but mention it in the summary so the agent knows.

NO-CONDITIONS DETECTION:
Set noConditionsMentioned = true ONLY when the notes explicitly state the client has no health issues ("no health issues", "healthy", "perfectly healthy", "no medical conditions", "clean bill of health"). Set it to false whenever the agent names ANY condition, even if you couldn't find a canonical match. This controls whether the UI defaults to "all carriers approved" or warns the agent that we couldn't match what they typed.

DIABETES nuance (apply strictly):
- "Type 2 diabetes" or "diabetes on insulin" or "diabetes, A1C 8.0" alone, with NO end-organ damage mentioned → "Diabetes (No Complications)". Insulin use by itself is NOT a complication.
- Only include "Diabetes (With Complications)" if the notes mention a diabetic complication: amputation, neuropathy, retinopathy, nephropathy/kidney disease, diabetic coma, insulin shock, diabetic ketoacidosis.
- If a complication is mentioned, include BOTH the specific complication row AND "Diabetes (With Complications)".

CANCER nuance:
- ANY named cancer (breast, lung, prostate, colon, pancreatic, ovarian, leukemia, lymphoma, etc.) that isn't its own row in the canonical list maps to the umbrella "Current Cancer (excluding basal/squamous cell skin cancer)" or "Past Cancer (excluding basal/squamous cell skin cancer)" row. The "excluding basal/squamous" phrasing means skin cancers are tracked elsewhere — it does NOT mean other cancers aren't covered. If the agent says "active breast cancer" → pick "Current Cancer (excluding basal/squamous cell skin cancer)".
- "Cancer in remission" / "had cancer X years ago" / "history of cancer" / "5 years cancer free" → Past Cancer row.
- "Currently being treated" / "diagnosed recently" / "on chemo" / "active cancer" / no remission mentioned → Current Cancer row.
- Skin cancers — only pick "Basal Cell Skin Cancer" or "Squamous cell skin cancer" if the notes specifically name those types. Melanoma is NOT basal/squamous — it goes under Current/Past Cancer.
- When in doubt about timing, default to Current Cancer if the notes describe an active diagnosis; default to Past Cancer only when remission/history is explicit.

TIMING / SEVERITY:
- Capture timing context in the summary, not as additional conditions.
- Don't add "everything" — if the notes only describe diabetes, return only diabetes.

OUTPUT:
- conditions: array of EXACT condition names from the canonical list
- noConditionsMentioned: boolean, see rule above
- summary: 2-3 sentence clinical interpretation explaining what you found and your reasoning. Mention what you DIDN'T include and why, when relevant (e.g. "No complication mentioned, so this is No Complications").`;

const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    conditions:            { type: "array", items: { type: "string" } },
    noConditionsMentioned: { type: "boolean" },
    summary:               { type: "string" },
  },
  required: ["conditions", "noConditionsMentioned", "summary"],
  additionalProperties: false,
} as const;

export async function analyzeNotes(opts: {
  text: string;
  toolkit: string;
  canonicalConditions: Array<{ condition: string; category: string }>;
  signal?: AbortSignal;
}): Promise<{ conditions: string[]; summary: string; noConditionsMentioned: boolean; usage: Usage }> {
  const list = opts.canonicalConditions
    .map((c) => `- ${c.condition} [${c.category}]`)
    .join("\n");

  // Prompt caching (PRE_LAUNCH_ROADMAP §4a). The instructions AND the ~287-row
  // canonical list are identical for every call on a toolkit, so both live in
  // the cached system prefix (two breakpoints: shared instructions, then the
  // per-toolkit list). Only the client notes vary, so they're the user turn
  // after the breakpoints. Same information to the model — zero quality change —
  // but repeat calls read the big stable block from cache (~0.1x) instead of
  // re-paying full input price. Min cacheable prefix on Haiku 4.5 is 4096 tokens;
  // instructions (~2.3k) + list (~6k) clear it comfortably.
  const { data: parsed, usage } = await structured({
    system: [
      { type: "text", text: ANALYZE_SYSTEM, cache_control: { type: "ephemeral" } },
      {
        type: "text",
        text: `Toolkit: ${opts.toolkit}\n\nCanonical condition list (you MUST pick exact names from this list):\n${list}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: `Client notes:\n${opts.text}` }],
    // A serverless request cannot afford the SDK default 10-minute timeout
    // and two retries. The route also supplies its remaining wall-clock budget.
    requestOptions: { timeout: 18_000, maxRetries: 0, signal: opts.signal },
    toolName: "underwriting_analysis",
    schema: ANALYZE_SCHEMA,
    maxTokens: 1024,
  });

  // Filter out any names the LLM made up that aren't actually in the canonical list.
  const valid = new Set(opts.canonicalConditions.map((c) => c.condition));
  if (!parsed) return { conditions: [], summary: "", noConditionsMentioned: false, usage };
  const conditions = Array.isArray(parsed.conditions)
    ? (parsed.conditions as unknown[])
        .filter((c): c is string => typeof c === "string")
        .filter((c) => valid.has(c))
    : [];
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const noConditionsMentioned = typeof parsed.noConditionsMentioned === "boolean"
    ? parsed.noConditionsMentioned
    : false;
  return { conditions, summary, noConditionsMentioned, usage };
}
