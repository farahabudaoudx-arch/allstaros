import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";
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
  // Optional downline producer id (RLS-scoped, same as the metrics route).
  const targetPersonId = url.searchParams.get("personId") || person.id;

  try {
    const supabase = await createClient();
    const result = await computeCalendar(supabase, targetPersonId, ym, tz);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/analytics/calendar",
      roleType: person.is_builder ? "builder" : "producer",
    });
  }
}
