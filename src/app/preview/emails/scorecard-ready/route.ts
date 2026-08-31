import { scorecardReadyEmail, type FrozenScorecardPeriod, type ScorecardReadyDeliveryType } from "@/lib/emails/scorecard-ready";

const PERIODS: Record<string, FrozenScorecardPeriod> = {
  monthly: { kind: "monthly", start: "2026-08-01", end: "2026-08-31" },
  quarterly: { kind: "quarterly", start: "2026-07-01", end: "2026-09-30" },
  annual: { kind: "annual", start: "2026-01-01", end: "2026-12-31" },
};

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const period = PERIODS[url.searchParams.get("period") ?? "monthly"] ?? PERIODS.monthly;
  const deliveryType: ScorecardReadyDeliveryType = url.searchParams.get("card") === "builder"
    ? "builder_email"
    : "producer_email";
  const mail = scorecardReadyEmail({
    period,
    deliveryType,
    appBaseUrl: url.origin,
  });

  return new Response(mail.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}