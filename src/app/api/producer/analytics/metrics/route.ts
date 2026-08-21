import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";
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
  const requestedPersonId = url.searchParams.get("personId");
  const targetPersonId = requestedPersonId || person.id;

  try {
    // Dev-only QA: force the generic load-error path without breaking Postgres.
    if (process.env.NODE_ENV === "development" && url.searchParams.get("fail") === "1") {
      throw new Error("dev forced failure");
    }

    // Local-dev only: viewing another person's board (?as= preview) reads with
    // the service role so it isn't blocked by RLS. Production always uses the
    // RLS client, which scopes downline reads to what the viewer may see.
    const devImpersonate =
      process.env.NODE_ENV === "development" &&
      !!requestedPersonId &&
      requestedPersonId !== person.id;
    const supabase = devImpersonate
      ? createServiceRoleClient()
      : await createClient();
    const result = await computeAnalytics(supabase, targetPersonId, {
      rangeKey,
      tz,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    // Hall of Fame is always the official Gateway personal YTD figure (never the
    // self-reported analytics number), so both pages show the same value. Take
    // the newest YTD snapshot for this person; the report year is the award year.
    const { data: hofRow } = await supabase
      .from("producer_issued_premium")
      .select("personal_ip_cents, report_date")
      .eq("person_id", targetPersonId)
      .eq("period_type", "ytd")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const hof = hofRow
      ? {
          currentCents: (hofRow as { personal_ip_cents: number }).personal_ip_cents,
          year: Number(String((hofRow as { report_date: string }).report_date).slice(0, 4)),
        }
      : null;

    return NextResponse.json({ ok: true, ...result, hof });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/analytics/metrics",
      rangeKey,
      roleType: person.is_builder ? "builder" : "producer",
    });
  }
}
