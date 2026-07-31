import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { computeLeaderboard, fetchAllRows, type RangeKey } from "@/lib/producer/metrics";
import { isLeaderboardExcluded } from "@/lib/producer/leaderboardExclusions";
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
    // Drop internal/test/owner rows so the team board matches the leaderboards.
    const visibleRoster = (roster ?? []).filter((p) => !isLeaderboardExcluded(p.id));

    // 2) Aggregates for the range (RLS clips to the same downline).
    const board = await computeLeaderboard(supabase, {
      rangeKey,
      tz,
      metric: "ap_cents",
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    const statsById = new Map(board.rows.map((r) => [r.person_id, r]));

    // 2b) Activity aggregates come from tracker_entry, which the leaderboard
    //     doesn't surface. This is ALSO the source of truth for "Policies Sold":
    //     tracker_entry.sales is kept in sync from the Clients book by the
    //     clients_sync_tracker DB trigger, so it's the exact number a producer
    //     sees on their Daily Tracker. Same range and RLS scope as above.
    type Activity = { sales: number; dials: number; contacts: number; appointments: number; presentations: number };
    // Paged so a team's daily tracker rows over a wide range aren't truncated at
    // the 1000-row cap (which understated activity totals).
    const trackerRows = await fetchAllRows<{ person_id: string } & Partial<Activity>>((lo, hi) =>
      supabase
        .from("tracker_entry")
        .select("person_id, sales, dials, contacts, appointments, presentations")
        .gte("entry_date", board.range.from)
        .lte("entry_date", board.range.to)
        .order("id")
        .range(lo, hi),
    );
    const activityById = new Map<string, Activity>();
    for (const t of trackerRows) {
      const a = activityById.get(t.person_id) ?? { sales: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0 };
      a.sales += Number(t.sales ?? 0);
      a.dials += Number(t.dials ?? 0);
      a.contacts += Number(t.contacts ?? 0);
      a.appointments += Number(t.appointments ?? 0);
      a.presentations += Number(t.presentations ?? 0);
      activityById.set(t.person_id, a);
    }

    // 3) Left-join the roster onto the aggregates so zero-production producers
    //    still appear; sort by AP desc, then name.
    const rows = visibleRoster
      .map((p) => {
        const s = statsById.get(p.id);
        const act = activityById.get(p.id);
        return {
          person_id: p.id,
          full_name: p.full_name ?? "Unknown",
          is_builder: !!p.is_builder,
          ap_cents: s?.ap_cents ?? 0,
          ip_cents: s?.ip_cents ?? 0,
          // "Policies Sold" — the single production count we report on the team
          // board. Sourced from tracker_entry.sales (Clients-synced) so it matches
          // each producer's own Daily Tracker exactly.
          policies_sold: act?.sales ?? 0,
          deposits_cents: s?.deposits_cents ?? 0,
          dials: act?.dials ?? 0,
          contacts: act?.contacts ?? 0,
          appointments: act?.appointments ?? 0,
          presentations: act?.presentations ?? 0,
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
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
