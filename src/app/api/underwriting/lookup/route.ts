import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupCarrierOutcomes } from "@/lib/underwriting/data";
import type { Toolkit } from "@/lib/underwriting/types";

export const dynamic = "force-dynamic";

const TOOLKITS: ReadonlySet<Toolkit> = new Set(["FEX", "SIUL"]);

// Exact-name lookup. Data lives in the bundled data.json (loaded into memory at
// startup) — no DB round trip.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.conditions)) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const conditions: string[] = (body.conditions as unknown[])
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.trim())
    .slice(0, 100);
  if (conditions.length === 0) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const toolkit: Toolkit = TOOLKITS.has(body.toolkit as Toolkit) ? (body.toolkit as Toolkit) : "FEX";
  const results = lookupCarrierOutcomes(toolkit, conditions);

  return NextResponse.json({ ok: true, results });
}
