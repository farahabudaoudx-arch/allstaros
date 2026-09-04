import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const key = request.nextUrl.searchParams.get("key");
  return !expected || auth === `Bearer ${expected}` || key === expected;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    skipped: true,
    reason:
      "Agency-wide Gateway scrape is retired. Issued Premium is filled from each person's own Gateway connection.",
  });
}
