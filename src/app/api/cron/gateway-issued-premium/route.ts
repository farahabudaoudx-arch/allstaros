import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  checkGatewayIssuedPremiumMonitor,
  GATEWAY_ISSUED_PREMIUM_PERIODS,
  isGatewayIssuedPremiumPeriod,
  recordGatewayIssuedPremiumFailure,
  runGatewayIssuedPremiumImport,
  type GatewayIssuedPremiumImportResult,
  type GatewayIssuedPremiumPeriod,
} from "@/lib/gateway/issued-premium";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const key = request.nextUrl.searchParams.get("key");
  return !expected || auth === `Bearer ${expected}` || key === expected;
}

function gatewayImportEnabled(request: NextRequest): boolean {
  return (
    request.nextUrl.searchParams.get("run") === "1" ||
    process.env.GATEWAY_ISSUED_PREMIUM_ENABLED === "1"
  );
}

function requestedPeriods(request: NextRequest): GatewayIssuedPremiumPeriod[] {
  const raw = request.nextUrl.searchParams.get("period")?.trim().toLowerCase() ?? null;
  if (!raw) return [...GATEWAY_ISSUED_PREMIUM_PERIODS];
  if (!isGatewayIssuedPremiumPeriod(raw)) {
    throw new Error("Invalid period. Use wtd, mtd, or ytd.");
  }
  return [raw];
}

function requestedSource(request: NextRequest): "csv" | "playwright" {
  const raw =
    request.nextUrl.searchParams.get("source")?.trim().toLowerCase() ??
    process.env.GATEWAY_ISSUED_PREMIUM_SOURCE?.trim().toLowerCase() ??
    "playwright";
  if (raw === "csv" || raw === "playwright") return raw;
  throw new Error("Invalid source. Use csv or playwright.");
}

function dryRunFailureResult(
  periodType: GatewayIssuedPremiumPeriod,
  err: unknown,
): GatewayIssuedPremiumImportResult {
  return {
    periodType,
    status: "failed",
    dryRun: true,
    importId: null,
    reportDate: null,
    periodStart: null,
    gatewayLabel: null,
    sourceFileName: null,
    sourceChecksum: null,
    rowsSeen: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    ambiguousCount: 0,
    skippedCount: 0,
    verifiedSubmittedCount: 0,
    message: err instanceof Error ? err.message : String(err),
    samples: { unmatched: [], ambiguous: [], matched: [] },
  };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  if (!gatewayImportEnabled(request)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason:
        "Gateway issued premium import is paused until GATEWAY_ISSUED_PREMIUM_ENABLED=1 is set.",
    });
  }

  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  const force = request.nextUrl.searchParams.get("force") === "1";
  const admin = createServiceRoleClient();

  let periods: GatewayIssuedPremiumPeriod[];
  let source: "csv" | "playwright";
  try {
    periods = requestedPeriods(request);
    source = requestedSource(request);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 },
    );
  }

  const results: GatewayIssuedPremiumImportResult[] = [];
  if (source === "playwright") {
    try {
      const { runGatewayIssuedPremiumPlaywrightImports } = await import(
        "@/lib/gateway/issued-premium-playwright"
      );
      results.push(
        ...(await runGatewayIssuedPremiumPlaywrightImports(admin, {
          periods,
          dryRun,
          force,
        })),
      );
    } catch (err) {
      Sentry.captureException(err, {
        tags: { cron: "gateway-issued-premium", source },
      });
      for (const periodType of periods) {
        results.push(
          dryRun
            ? dryRunFailureResult(periodType, err)
            : await recordGatewayIssuedPremiumFailure(admin, periodType, err),
        );
      }
    }
  } else {
    for (const periodType of periods) {
      try {
        results.push(
          await runGatewayIssuedPremiumImport(admin, {
            periodType,
            dryRun,
            force,
          }),
        );
      } catch (err) {
        Sentry.captureException(err, {
          tags: { cron: "gateway-issued-premium", source, periodType },
        });
        results.push(
          dryRun
            ? dryRunFailureResult(periodType, err)
            : await recordGatewayIssuedPremiumFailure(admin, periodType, err),
        );
      }
    }
  }

  let monitor = null;
  try {
    monitor = await checkGatewayIssuedPremiumMonitor(admin);
    if (!monitor.ok) {
      Sentry.captureMessage("Gateway issued premium monitor failed", {
        level: "error",
        tags: { cron: "gateway-issued-premium" },
        extra: monitor,
      });
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { cron: "gateway-issued-premium", step: "monitor" },
    });
    monitor = {
      ok: false,
      error: err instanceof Error ? err.message : "Monitor check failed",
    };
  }

  const failed = results.some((result) => result.status === "failed");
  const ok = !failed && (monitor as { ok?: boolean } | null)?.ok !== false;
  return NextResponse.json(
    {
      ok,
      source,
      dryRun,
      force,
      periods,
      results,
      monitor,
    },
    { status: ok ? 200 : 500 },
  );
}
