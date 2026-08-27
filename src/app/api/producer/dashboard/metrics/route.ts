import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";
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
    // Dev-only QA: force the generic load-error path without breaking Postgres.
    if (process.env.NODE_ENV === "development" && url.searchParams.get("fail") === "1") {
      throw new Error("dev forced failure");
    }

    const supabase = await createClient();
    const result = await computeDashboard(supabase, person.id, {
      rangeKey,
      tz,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/dashboard/metrics",
      rangeKey,
      roleType: person.is_builder ? "builder" : "producer",
    });
  }
}
