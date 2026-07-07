import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import {
  computeIpLeaderboard,
  IP_BOARDS,
  IP_SNAPSHOT_PERIODS,
  type IpBoard,
  type IpPeriod,
} from "@/lib/producer/ip-leaderboard";

// GET /api/producer/ip-leaderboard?board=producer|team&period=wtd|mtd|ytd
//   (or period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD)
// Org-wide ranking: every producer sees the same board, so it runs with the
// service-role client to bypass the per-person RLS scope. The viewer must
// still be signed in; we echo their person id so the client can highlight
// their row.
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const boardParam = url.searchParams.get("board");
  const periodParam = url.searchParams.get("period");
  const board: IpBoard = IP_BOARDS.includes(boardParam as IpBoard)
    ? (boardParam as IpBoard)
    : "producer";
  const period: IpPeriod =
    periodParam === "custom" ||
    IP_SNAPSHOT_PERIODS.includes(periodParam as (typeof IP_SNAPSHOT_PERIODS)[number])
      ? (periodParam as IpPeriod)
      : "mtd";

  try {
    const supabase = createServiceRoleClient();
    const result = await computeIpLeaderboard(supabase, {
      board,
      period,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    return NextResponse.json({ ok: true, meId: person.id, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
