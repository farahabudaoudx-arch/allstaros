import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";
import { computeLeaderboard, type RangeKey } from "@/lib/producer/metrics";
import { isLeaderboardExcluded } from "@/lib/producer/leaderboardExclusions";
import { safeTz } from "@/lib/producer/time";
import { installationTimezone } from "@/lib/installation/runtime";

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
  const tz = safeTz(url.searchParams.get("tz"), installationTimezone());

  try {
    const supabase = await createClient();

    // In parallel (independent):
    //   - full roster of active producers/builders the viewer can see
    //   - range aggregates from leaderboard_aggregates() (RLS clips both to the
    //     same downline). Board rows already carry tracker activity sums.
    const [rosterRes, board] = await Promise.all([
      supabase
        .from("person")
        .select("id, full_name, is_builder, is_producer, status")
        .eq("status", "active")
        .or("is_producer.eq.true,is_builder.eq.true"),
      computeLeaderboard(supabase, {
        rangeKey,
        tz,
        metric: "ap_cents",
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      }),
    ]);
    if (rosterRes.error) throw new Error(rosterRes.error.message);
    const visibleRoster = (rosterRes.data ?? []).filter((p) => !isLeaderboardExcluded(p.id));
    const statsById = new Map(board.rows.map((r) => [r.person_id, r]));

    // Left-join roster onto aggregates so zero-production producers still appear.
    const rows = visibleRoster
      .map((p) => {
        const s = statsById.get(p.id);
        return {
          person_id: p.id,
          full_name: p.full_name ?? "Unknown",
          is_builder: !!p.is_builder,
          ap_cents: s?.ap_cents ?? 0,
          ip_cents: s?.ip_cents ?? 0,
          // "Policies Sold" — tracker_entry.sales (Clients-synced) so it matches
          // each producer's Daily Tracker. Exposed as tracker_sales from the RPC.
          policies_sold: s?.tracker_sales ?? 0,
          deposits_cents: s?.deposits_cents ?? 0,
          dials: s?.dials ?? 0,
          contacts: s?.contacts ?? 0,
          appointments: s?.appointments ?? 0,
          presentations: s?.presentations ?? 0,
        };
      })
      .sort(
        (a, b) =>
          b.ap_cents - a.ap_cents ||
          b.policies_sold - a.policies_sold ||
          a.full_name.localeCompare(b.full_name),
      );

    const totals = rows.reduce(
      (acc, r) => ({
        ap_cents: acc.ap_cents + r.ap_cents,
        ip_cents: acc.ip_cents + r.ip_cents,
        policies_sold: acc.policies_sold + r.policies_sold,
        dials: acc.dials + r.dials,
        contacts: acc.contacts + r.contacts,
        appointments: acc.appointments + r.appointments,
        presentations: acc.presentations + r.presentations,
      }),
      { ap_cents: 0, ip_cents: 0, policies_sold: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0 },
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
    return producerLoadErrorResponse(err, {
      route: "/api/producer/team",
      rangeKey,
      roleType: "builder",
    });
  }
}
