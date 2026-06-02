import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { computeDashboard, type RangeKey } from "@/lib/producer/metrics";
import { safeTz } from "@/lib/producer/time";

// GET /api/producer/dashboard/metrics?range=mtd&tz=America/Chicago
//   (or range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD)
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const rangeKey = (url.searchParams.get("range") ?? "mtd") as RangeKey;
  const tz = safeTz(url.searchParams.get("tz"));

  try {
    const supabase = await createClient();
    const result = await computeDashboard(supabase, person.id, {
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
