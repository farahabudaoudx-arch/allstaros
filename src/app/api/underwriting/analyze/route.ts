import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeNotes } from "@/lib/underwriting/llm";
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
//   2. Hand the list + the notes to gpt-4o-mini with a strict clinical prompt.
//   3. The LLM picks exact condition names from the list (post-filtered against
//      the canonical set to drop any hallucinations).
//   4. Look up carrier outcomes for the matched conditions.

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
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
  let analysis: { conditions: string[]; summary: string; noConditionsMentioned: boolean };
  try {
    analysis = await analyzeNotes({ text, toolkit, canonicalConditions });
  } catch (e: any) {
    console.error("[underwriting/analyze] LLM call failed:", e);
    return NextResponse.json({ ok: false, stage: "llm", error: e?.message ?? "LLM failed" }, { status: 502 });
  }

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
