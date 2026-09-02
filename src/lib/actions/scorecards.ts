"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { scorecardPeriodFromStart, validateClosedScorecardPeriod } from "@/lib/scorecards/period";
import { loadGatewayCoverageReport } from "@/lib/scorecards/coverage";
import { generateManualScorecard as generateManualScorecardService } from "@/lib/scorecards/manual";
import type { ScorecardPeriodKind } from "@/lib/scorecards/run";

function chicagoToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function startScorecardRun(formData: FormData) {
  const admin = await requireAdmin();
  const periodKind = text(formData, "periodKind");
  const periodStart = text(formData, "periodStart");
  const periodEnd = text(formData, "periodEnd");

  if (!["monthly", "quarterly", "annual"].includes(periodKind)) {
    redirect("/admin/scorecards?error=Choose+a+valid+period+type");
  }
  let period;
  try {
    period = validateClosedScorecardPeriod({
      kind: periodKind as ScorecardPeriodKind,
      start: periodStart,
      end: periodEnd,
      today: chicagoToday(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enter a valid closed period.";
    redirect(`/admin/scorecards?error=${encodeURIComponent(message)}`);
  }

  const service = createServiceRoleClient();
  const coverage = await loadGatewayCoverageReport(service, period, "all");
  if (coverage.inScope === 0) {
    redirect("/admin/scorecards?error=Nobody+was+an+active+Producer+or+Builder+at+that+period+end.");
  }
  if (coverage.missing > 0) {
    redirect(`/admin/scorecards?error=${encodeURIComponent(
      `${coverage.missing} of ${coverage.inScope} card scopes are missing Gateway coverage. Open Gateway Coverage, then retry.`,
    )}`);
  }
  // A full org run on the scale-test roster is thousands of cards. Keep the
  // live button for demo-sized periods (the June 2026 scorecard-demo seed).
  const MAX_LIVE_CARDS = 40;
  if (coverage.inScope > MAX_LIVE_CARDS) {
    redirect(`/admin/scorecards?error=${encodeURIComponent(
      `This period has ${coverage.inScope} eligible cards. Use Manual generation, or a period whose roster is ${MAX_LIVE_CARDS} or fewer (the demo seed uses June 2026).`,
    )}`);
  }

  const failures: string[] = [];
  let published = 0;
  for (const entry of coverage.entries) {
    const result = await generateManualScorecardService({
      initiatedBy: admin.id,
      personId: entry.personId,
      cardType: entry.cardType,
      period,
    });
    if (result.status === "success" || result.status === "existing") {
      published += 1;
      continue;
    }
    failures.push(
      `${entry.fullName} (${entry.cardType}): ${"message" in result ? result.message : result.status}`,
    );
  }

  revalidatePath("/admin/scorecards");
  revalidatePath("/producer/scorecards");
  if (failures.length > 0) {
    redirect(`/admin/scorecards?error=${encodeURIComponent(
      `Published ${published}/${coverage.inScope}. ${failures[0]}`,
    )}`);
  }
  redirect("/admin/scorecards?started=1");
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function manualRedirectParams(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  return `/admin/scorecards?${params.toString()}`;
}

export async function generateManualScorecard(formData: FormData) {
  const admin = await requireAdmin();
  const personId = text(formData, "personId");
  const cardType = text(formData, "cardType");
  const periodKind = text(formData, "periodKind");
  const periodStart = text(formData, "periodStart");
  const selection = {
    manualPersonId: personId,
    manualPeriodKind: periodKind,
    manualPeriodStart: periodStart,
  };

  if (!UUID.test(personId)) {
    redirect(manualRedirectParams({ ...selection, manualError: "Choose a valid person." }));
  }
  if (cardType !== "producer" && cardType !== "builder") {
    redirect(manualRedirectParams({ ...selection, manualError: "Choose an applicable Scorecard type." }));
  }
  if (!["monthly", "quarterly", "annual"].includes(periodKind)) {
    redirect(manualRedirectParams({ ...selection, manualError: "Choose a valid period type." }));
  }

  let period;
  try {
    const canonical = scorecardPeriodFromStart(periodKind as ScorecardPeriodKind, periodStart);
    period = validateClosedScorecardPeriod({
      kind: periodKind as ScorecardPeriodKind,
      start: canonical.start,
      end: canonical.end,
      today: chicagoToday(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Choose a valid closed Scorecard period.";
    redirect(manualRedirectParams({ ...selection, manualError: message }));
  }

  const result = await generateManualScorecardService({
    initiatedBy: admin.id,
    personId,
    cardType,
    period,
  });

  if (result.status === "success" || result.status === "existing") {
    revalidatePath("/admin/scorecards");
    redirect(manualRedirectParams({
      ...selection,
      manualResult: result.status,
      snapshotId: result.snapshotId,
    }));
  }

  redirect(manualRedirectParams({ ...selection, manualError: "message" in result ? result.message : "Unable to generate the Scorecard." }));
}
