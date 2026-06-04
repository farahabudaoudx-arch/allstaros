import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { computeAnalytics, type RangeKey } from "@/lib/producer/metrics";
import { safeTz } from "@/lib/producer/time";

// GET /api/producer/analytics/metrics?range=mtd&tz=America/Chicago
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const rangeKey = (url.searchParams.get("range") ?? "mtd") as RangeKey;
  const tz = safeTz(url.searchParams.get("tz"));
  // A builder can view a downline producer's board by passing personId. RLS on
  // the underlying tables scopes the data to what the viewer is allowed to see,
  // so an out-of-downline id simply returns an empty board (no leak).
  const targetPersonId = url.searchParams.get("personId") || person.id;

  try {
    const supabase = await createClient();
    const result = await computeAnalytics(supabase, targetPersonId, {
      rangeKey,
      tz,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
