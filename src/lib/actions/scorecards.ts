"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { validateClosedScorecardPeriod } from "@/lib/scorecards/period";
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
