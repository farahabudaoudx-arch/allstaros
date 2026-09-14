"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";
import { isUuid } from "@/lib/whitelabel/validation";
import { executeNextProvisioningStep, startProvisioning } from "@/lib/whitelabel/provisioning/orchestrator";

function pathFor(buildId: string): string {
  return `/admin/os-builds/${buildId}`;
}

function fail(buildId: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "Provisioning could not continue.";
  redirect(`${pathFor(buildId)}?error=${encodeURIComponent(message)}`);
}

export async function adminStartOsBuildProvisioning(formData: FormData) {
  const person = await requireAdmin("/admin/os-builds");
  const buildId = String(formData.get("build_id") ?? "").trim();
  if (!isUuid(buildId)) redirect("/admin/os-builds?error=Invalid%20build.");
  const sourceSha = String(formData.get("source_sha") ?? "").trim();
  try {
    const state = await startProvisioning({ buildId, sourceSha, actorId: person.id });
    await writeAudit({
      actorId: person.id,
      action: "whitelabel.provisioning.start",
      detail: { buildId, runId: state.run.id, sourceSha: state.run.source_sha },
    });
    revalidatePath(pathFor(buildId));
    redirect(`${pathFor(buildId)}?ok=provisioning-started`);
  } catch (error) {
    fail(buildId, error);
  }
}

export async function adminRunNextOsBuildProvisioning(formData: FormData) {
  const person = await requireAdmin("/admin/os-builds");
  const buildId = String(formData.get("build_id") ?? "").trim();
  const runId = String(formData.get("run_id") ?? "").trim();
  if (!isUuid(buildId) || !isUuid(runId)) redirect("/admin/os-builds?error=Invalid%20provisioning%20run.");
  try {
    const state = await executeNextProvisioningStep({ buildId, runId });
    await writeAudit({
      actorId: person.id,
      action: "whitelabel.provisioning.advance",
      detail: { buildId, runId, status: state.run.status, currentStep: state.run.current_step },
    });
    revalidatePath(pathFor(buildId));
    redirect(`${pathFor(buildId)}?ok=provisioning-advanced`);
  } catch (error) {
    fail(buildId, error);
  }
}
