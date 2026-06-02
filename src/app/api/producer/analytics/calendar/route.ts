import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { computeCalendar } from "@/lib/producer/metrics";
import { safeTz } from "@/lib/producer/time";

const ISO_YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// GET /api/producer/analytics/calendar?month=YYYY-MM&tz=America/Chicago
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const ym = url.searchParams.get("month");
  if (!ym || !ISO_YEAR_MONTH.test(ym)) {
    return NextResponse.json({ ok: false, error: "bad month (expected YYYY-MM)" }, { status: 400 });
  }
  const tz = safeTz(url.searchParams.get("tz"));

  try {
    const supabase = await createClient();
    const result = await computeCalendar(supabase, person.id, ym, tz);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
