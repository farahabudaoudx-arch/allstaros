import { NextResponse, type NextRequest } from "next/server";
import { processPendingGatewayReminders } from "@/lib/gateway/reminder-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Gateway reminder cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(await processPendingGatewayReminders());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Gateway reminder error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
