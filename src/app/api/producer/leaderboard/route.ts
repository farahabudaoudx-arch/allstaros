import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";
import { computeLeaderboard, type LeaderboardMetric, type RangeKey } from "@/lib/producer/metrics";
import { safeTz } from "@/lib/producer/time";

const METRICS: LeaderboardMetric[] = [
  "ap_cents",
  "ip_cents",
  "sales",
  "policies",
  "deposits_cents",
  "dials",
  "contacts",
  "presentations",
];

// GET /api/producer/leaderboard?range=mtd&metric=ap_cents&tz=America/Chicago
//   (or range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD)
// Org-wide ranking: every producer sees the same board, so it runs with the
// service-role client to bypass the per-person RLS scope. The viewer must still
// be signed in; we echo their person id so the client can highlight their row.
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const rangeKey = (url.searchParams.get("range") ?? "mtd") as RangeKey;
  const tz = safeTz(url.searchParams.get("tz"));
  const metricParam = url.searchParams.get("metric") as LeaderboardMetric | null;
  const metric = metricParam && METRICS.includes(metricParam) ? metricParam : "ap_cents";

  try {
    const supabase = createServiceRoleClient();
    const result = await computeLeaderboard(supabase, {
      rangeKey,
      tz,
      metric,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    return NextResponse.json({ ok: true, meId: person.id, ...result });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/leaderboard",
      rangeKey,
      roleType: person.is_builder ? "builder" : "producer",
    });
  }
}
