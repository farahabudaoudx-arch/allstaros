import { NextResponse, type NextRequest } from "next/server";
import { processCompletedScorecardPeriods } from "@/lib/scorecards/auto-publish";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Scorecard publishing cron is not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await processCompletedScorecardPeriods();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scorecard publishing failed" },
      { status: 500 },
    );
  }
}
