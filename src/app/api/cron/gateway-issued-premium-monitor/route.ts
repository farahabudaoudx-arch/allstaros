import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { checkGatewayIssuedPremiumMonitor } from "@/lib/gateway/issued-premium";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

  const admin = createServiceRoleClient();
  try {
    const monitor = await checkGatewayIssuedPremiumMonitor(admin);
    if (!monitor.ok) {
      Sentry.captureMessage("Gateway issued premium monitor failed", {
        level: "error",
        tags: { cron: "gateway-issued-premium-monitor" },
        extra: monitor,
      });
    }
    return NextResponse.json(monitor, { status: monitor.ok ? 200 : 500 });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { cron: "gateway-issued-premium-monitor" },
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Monitor check failed" },
      { status: 500 },
    );
  }
}
