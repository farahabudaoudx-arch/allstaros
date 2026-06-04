import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { computeLeaderboard, type RangeKey } from "@/lib/producer/metrics";
import { safeTz } from "@/lib/producer/time";

// GET /api/producer/team?range=mtd&tz=America/Chicago
//   (or range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD)
//
// The builder's whole team — every producer in their downline (plus themselves),
// including ones with zero production for the range. Runs with the AUTHED client
// so RLS scopes both the roster and the aggregates to the builder's downline.
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!person.is_builder) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const rangeKey = (url.searchParams.get("range") ?? "mtd") as RangeKey;
  const tz = safeTz(url.searchParams.get("tz"));

  try {
    const supabase = await createClient();

    // 1) The full roster: every active producer/builder the viewer can see.
    const { data: roster, error: rosterErr } = await supabase
      .from("person")
      .select("id, full_name, is_builder, is_producer, status")
      .eq("status", "active")
      .or("is_producer.eq.true,is_builder.eq.true");
    if (rosterErr) throw new Error(rosterErr.message);

    // 2) Aggregates for the range (RLS clips to the same downline).
    const board = await computeLeaderboard(supabase, {
      rangeKey,
      tz,
      metric: "ap_cents",
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    const statsById = new Map(board.rows.map((r) => [r.person_id, r]));

    // 3) Left-join the roster onto the aggregates so zero-production producers
    //    still appear; sort by AP desc, then name.
    const rows = (roster ?? [])
      .map((p) => {
        const s = statsById.get(p.id);
        return {
          person_id: p.id,
          full_name: p.full_name ?? "Unknown",
          is_builder: !!p.is_builder,
          ap_cents: s?.ap_cents ?? 0,
          ip_cents: s?.ip_cents ?? 0,
          sales: s?.sales ?? 0,
          policies: s?.policies ?? 0,
          deposits_cents: s?.deposits_cents ?? 0,
        };
      })
      .sort(
        (a, b) =>
          b.ap_cents - a.ap_cents ||
          b.policies - a.policies ||
          a.full_name.localeCompare(b.full_name),
      );

    const totals = rows.reduce(
      (acc, r) => ({
        ap_cents: acc.ap_cents + r.ap_cents,
        ip_cents: acc.ip_cents + r.ip_cents,
        policies: acc.policies + r.policies,
        sales: acc.sales + r.sales,
      }),
      { ap_cents: 0, ip_cents: 0, policies: 0, sales: 0 },
    );

    return NextResponse.json({
      ok: true,
      meId: person.id,
      range: board.range,
      producers: rows.length,
      totals,
      rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
