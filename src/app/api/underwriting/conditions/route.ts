import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Toolkit } from "@/lib/underwriting/types";
import { getCarriersForToolkit, getConditionsForToolkit } from "@/lib/underwriting/data";

export const dynamic = "force-dynamic";

const TOOLKITS: ReadonlySet<Toolkit> = new Set(["FEX", "SIUL"]);

// Returns the canonical condition × category list and the carrier list for a
// toolkit. Data is loaded from the bundled data.json — no DB round trip.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawTk = url.searchParams.get("toolkit");
  const toolkit: Toolkit = TOOLKITS.has(rawTk as Toolkit) ? (rawTk as Toolkit) : "FEX";

  const conditions = getConditionsForToolkit(toolkit);
  const carriers = getCarriersForToolkit(toolkit);

  return NextResponse.json({ ok: true, toolkit, conditions, carriers });
}
