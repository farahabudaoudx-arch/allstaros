import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { rebuildDiscordLeaderboards } from "@/lib/actions/discord";
import type { DiscordPeriod } from "@/lib/producer/submitted-ap-leaderboard";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";
import { PRODUCER_API_ERROR_COPY } from "@/lib/producer/error-copy";

const ALL_PERIODS: DiscordPeriod[] = ["daily", "wtd", "mtd", "ytd"];

// POST /api/producer/discord/rebuild
// Recompute and re-post/edit the caller's own Discord leaderboard messages.
// Body: { periods?: ["daily","wtd","mtd","ytd"] }, defaults to all four.
export async function POST(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!person.is_builder && !person.is_admin && !person.is_super_admin)
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  // The body is optional; an empty or missing body means all periods.
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // No body sent. Fall through with the defaults.
  }

  let periods: DiscordPeriod[] = ALL_PERIODS;
  if ("periods" in body) {
    if (!Array.isArray(body.periods) || body.periods.length === 0)
      return NextResponse.json({ ok: false, error: "periods must be a non-empty array" }, { status: 400 });
    for (const p of body.periods) {
      if (!ALL_PERIODS.includes(p as DiscordPeriod))
        return NextResponse.json({ ok: false, error: `invalid period: ${String(p)}` }, { status: 400 });
    }
    periods = Array.from(new Set(body.periods as DiscordPeriod[]));
  }

  try {
    const updated = await rebuildDiscordLeaderboards(person.id, periods);
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/discord/rebuild",
      queryPhase: "discord",
      clientMessage: PRODUCER_API_ERROR_COPY,
    });
  }
}
