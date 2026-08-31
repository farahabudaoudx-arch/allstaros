import { NextResponse, type NextRequest } from "next/server";
import { processPendingScorecardDeliveries } from "@/lib/scorecards/delivery-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Scorecard delivery cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const summary = await processPendingScorecardDeliveries();
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Scorecard delivery error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}