import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { analyzeNotes, UNDERWRITING_MODEL } from "@/lib/underwriting/llm";
import { checkAiRateLimit, recordAiUsage } from "@/lib/ai/usage";
import { getConditionsForToolkit, lookupCarrierOutcomes } from "@/lib/underwriting/data";
import type { Toolkit } from "@/lib/underwriting/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TOOLKITS: ReadonlySet<Toolkit> = new Set(["FEX", "SIUL"]);

// LLM-driven analyze: takes freeform client notes, returns SPECIFIC matched
// canonical conditions + a clinical summary + the per-carrier outcome grid.
//
// Pipeline:
//   1. Load the canonical condition list for the toolkit (~287 rows).
//   2. Hand the list + the notes to Claude (Haiku 4.5) with a strict clinical prompt.
//   3. The LLM picks exact condition names from the list (post-filtered against
//      the canonical set to drop any hallucinations).
//   4. Look up carrier outcomes for the matched conditions.

export async function POST(req: Request) {
  const person = await getCurrentPerson();
  if (!person) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const limit = await checkAiRateLimit(person.id, "underwriting_analyze");
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: limit.reason },
      {
        status: 429,
        headers: limit.retryAfterSeconds
          ? { "Retry-After": String(limit.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.text !== "string") {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const text: string = body.text.slice(0, 8000).trim();
  if (!text) {
    return NextResponse.json({ ok: true, conditions: [], summary: "", results: [], noConditionsMentioned: false });
  }
  const toolkit: Toolkit = TOOLKITS.has(body.toolkit as Toolkit) ? (body.toolkit as Toolkit) : "FEX";

  // Step 1: canonical condition list for the toolkit (from the in-memory JSON).
  const canonicalConditions = getConditionsForToolkit(toolkit);
  if (canonicalConditions.length === 0) {
    return NextResponse.json({
      ok: false,
      stage: "load-conditions",
      error: "No canonical conditions found for this toolkit.",
    }, { status: 500 });
  }

  // Step 2: LLM analysis.
  let analysis: Awaited<ReturnType<typeof analyzeNotes>>;
  try {
    analysis = await analyzeNotes({ text, toolkit, canonicalConditions });
  } catch (e: any) {
    console.error("[underwriting/analyze] LLM call failed:", e);
    return NextResponse.json({ ok: false, stage: "llm", error: e?.message ?? "LLM failed" }, { status: 502 });
  }

  // Record what the model call spent (best-effort; the model ran, so count it).
  await recordAiUsage({
    personId: person.id,
    tool: "underwriting_analyze",
    model: UNDERWRITING_MODEL,
    usage: analysis.usage,
  });

  if (analysis.conditions.length === 0) {
    return NextResponse.json({
      ok: true,
      conditions: [],
      summary: analysis.summary || "No specific underwriting conditions detected in the notes.",
      results: [],
      noConditionsMentioned: analysis.noConditionsMentioned,
    });
  }

  // Step 3: carrier outcomes for the matched conditions.
  const results = lookupCarrierOutcomes(toolkit, analysis.conditions);

  return NextResponse.json({
    ok: true,
    conditions: analysis.conditions,
    summary: analysis.summary,
    results,
    noConditionsMentioned: analysis.noConditionsMentioned,
  });
}
