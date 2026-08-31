"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { scorecardPeriodFromStart, validateClosedScorecardPeriod } from "@/lib/scorecards/period";
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
  const { data: prior, error: priorError } = await service
    .from("scorecard_metric_run")
    .select("id, revision")
    .eq("period_kind", periodKind)
    .eq("period_start", periodStart)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (priorError) throw new Error(`Unable to check Scorecard revisions: ${priorError.message}`);

  if (prior) {
    redirect("/admin/scorecards?error=Use+the+correction+workflow+for+an+existing+period");
  }

  const { error } = await service.from("scorecard_metric_run").insert({
    period_kind: periodKind,
    period_start: periodStart,
    period_end: periodEnd,
    period_label: period.label,
    revision: 1,
    status: "capturing",
    initiated_by: admin.id,
  });
  if (error) throw new Error(`Unable to start the Scorecard run: ${error.message}`);

  revalidatePath("/admin/scorecards");
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
