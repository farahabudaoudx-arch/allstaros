"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";
import { isUuid, optionalText } from "@/lib/whitelabel/validation";
import { verifyLiveInstallationVersion } from "@/lib/whitelabel/verification";
import { executeNextUpdateStep, finalizeVerifiedUpdate } from "@/lib/whitelabel/updates/orchestrator";
import { executeRecovery } from "@/lib/whitelabel/updates/recovery";
import { createReleaseSnapshot } from "@/lib/whitelabel/updates/release";
import { buildCompatibilityVerification } from "@/lib/whitelabel/updates/verification";
import {
  beginRejoinForAdmin,
  bootstrapInstallationLifecycleForBuild,
  completeRejoinForAdmin,
  createRecoveryRunForAdmin,
  createReleaseForAdmin,
  createUpdateAdminPort,
  enterIndependentOperation,
  finalizeOperationalVerificationForAdmin,
  loadCompatibilityEvidence,
  scheduleUpdateForAdmin,
  startOperationalVerificationForAdmin,
  syncInstallationEntitlementsForAdmin,
  transitionMaintenanceForAdmin,
  transitionReleaseForAdmin,
} from "@/lib/whitelabel/updates/persistence";

const LIST_PATH = "/admin/os-builds";
const RELEASES_PATH = "/admin/os-updates";
const MAINTENANCE = new Set(["active", "declined", "paused", "ended"]);

function operationsPath(buildId: string): string {
  return `/admin/os-builds/${buildId}/operations`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The managed operation could not be completed.";
}

function fail(path: string, error: unknown): never {
  redirect(`${path}?error=${encodeURIComponent(errorMessage(error))}`);
}

function done(path: string, code: string): never {
  redirect(`${path}?ok=${encodeURIComponent(code)}`);
}

function uuidField(formData: FormData, name: string, label: string): string {
  const value = String(formData.get(name) ?? "").trim();
  if (!isUuid(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function buildIdFrom(formData: FormData): string {
  return uuidField(formData, "build_id", "OS build");
}

function releaseKey(value: FormDataEntryValue | null, fallback: string): string {
  const text = String(value ?? "").trim() || fallback;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(text)) {
    throw new Error("Release key may contain only letters, numbers, dots, underscores, and dashes.");
  }
  return text;
}

function scheduledAt(value: FormDataEntryValue | null): string {
  const text = String(value ?? "").trim();
  const parsed = new Date(text);
  if (!text || !Number.isFinite(parsed.getTime())) throw new Error("A valid update schedule is required.");
  return parsed.toISOString();
}

function revalidateOperations(buildId: string): void {
  revalidatePath(operationsPath(buildId));
  revalidatePath(`/admin/os-builds/${buildId}`);
  revalidatePath(RELEASES_PATH);
}

export async function adminBootstrapOsOperations(formData: FormData) {
  const actor = await requireAdmin(LIST_PATH);
  let buildId: string;
  try {
    buildId = buildIdFrom(formData);
    const installationId = await bootstrapInstallationLifecycleForBuild(buildId, actor.id);
    await writeAudit({
      actorId: actor.id,
      action: "whitelabel.operations.bootstrap",
      detail: { buildId, installationId },
    });
    revalidateOperations(buildId);
  } catch (error) {
    const rawBuildId = String(formData.get("build_id") ?? "").trim();
    fail(isUuid(rawBuildId) ? operationsPath(rawBuildId) : LIST_PATH, error);
  }
  done(operationsPath(buildId!), "operations-bootstrapped");
}

export async function adminTransitionOsMaintenance(formData: FormData) {
  const actor = await requireAdmin(LIST_PATH);
  let buildId = "";
  try {
    buildId = buildIdFrom(formData);
    const installationId = uuidField(formData, "installation_id", "Installation");
    const newStatus = String(formData.get("maintenance_status") ?? formData.get("new_status") ?? "").trim();
    if (!MAINTENANCE.has(newStatus)) throw new Error("Maintenance status is invalid.");
    const reason = optionalText(formData.get("reason"), 1000);
    const status = await transitionMaintenanceForAdmin({
      buildId,
      installationId,
      newStatus: newStatus as "active" | "declined" | "paused" | "ended",
      actorId: actor.id,
      reason,
    });
    await writeAudit({ actorId: actor.id, action: "whitelabel.maintenance.transition", detail: { buildId, installationId, status } });
    revalidateOperations(buildId);
  } catch (error) {
    fail(buildId && isUuid(buildId) ? operationsPath(buildId) : LIST_PATH, error);
  }
  done(operationsPath(buildId), "maintenance-updated");
}

export async function adminEnterOsIndependentOperation(formData: FormData) {
  const actor = await requireAdmin(LIST_PATH);
  let buildId = "";
  try {
    buildId = buildIdFrom(formData);
    const installationId = uuidField(formData, "installation_id", "Installation");
    const reason = optionalText(formData.get("reason"), 1000);
    const mode = await enterIndependentOperation({ buildId, installationId, actorId: actor.id, reason });
    await writeAudit({ actorId: actor.id, action: "whitelabel.operations.independent", detail: { buildId, installationId, mode } });
    revalidateOperations(buildId);
  } catch (error) {
    fail(buildId && isUuid(buildId) ? operationsPath(buildId) : LIST_PATH, error);
  }
  done(operationsPath(buildId), "independent-operation");
}

export async function adminBeginOsCompatibilityRejoin(formData: FormData) {
  const actor = await requireAdmin(LIST_PATH);
  let buildId = "";
  let resultCode = "rejoin-blocked";
  try {
    buildId = buildIdFrom(formData);
    const installationId = uuidField(formData, "installation_id", "Installation");
    await beginRejoinForAdmin({ buildId, installationId, actorId: actor.id });
    const evidence = await loadCompatibilityEvidence(buildId, installationId);
    const live = await verifyLiveInstallationVersion({
      osUrl: evidence.osUrl,
      expectedSha: evidence.currentVersion.source_sha,
      expectedSchema: evidence.currentVersion.schema_release,
    });
    const verification = buildCompatibilityVerification({
      liveSourceSha: live.evidence.actualSha,
      liveSchemaRelease: live.evidence.actualSchema,
      // Rejoin must prove the live installation still matches the current
      // lifecycle ledger. A merely "known" older/newer release is drift until
      // an explicit adoption workflow exists.
      knownSourceShas: [evidence.currentVersion.source_sha],
      knownSchemaReleases: [evidence.currentVersion.schema_release],
      actualMigrationNames: evidence.actualMigrationNames,
      knownMigrationNames: evidence.knownMigrationNames,
      providerRefsMatch: evidence.providerRefsMatch,
    });
    const runId = await startOperationalVerificationForAdmin({
      buildId,
      installationId,
      actorId: actor.id,
      sourceSha: evidence.currentVersion.source_sha,
      schemaRelease: evidence.currentVersion.schema_release,
      deploymentUrl: evidence.currentVersion.deployment_url,
      verification,
    });
    const status = await finalizeOperationalVerificationForAdmin({ buildId, runId, actorId: actor.id });
    let mode = "rejoining";
    if (status === "passed") {
      mode = await completeRejoinForAdmin({ buildId, installationId, actorId: actor.id });
    }
    await writeAudit({
      actorId: actor.id,
      action: "whitelabel.operations.compatibility",
      detail: { buildId, installationId, runId, compatible: verification.compatible, verificationStatus: status, mode },
    });
    revalidateOperations(buildId);
    resultCode = status === "passed" ? "rejoin-complete" : "rejoin-blocked";
  } catch (error) {
    fail(buildId && isUuid(buildId) ? operationsPath(buildId) : LIST_PATH, error);
  }
  done(operationsPath(buildId), resultCode);
}

export async function adminSyncOsEntitlements(formData: FormData) {
  const actor = await requireAdmin(LIST_PATH);
  let buildId = "";
  try {
    buildId = buildIdFrom(formData);
    const installationId = uuidField(formData, "installation_id", "Installation");
    const result = await syncInstallationEntitlementsForAdmin({ buildId, installationId, actorId: actor.id });
    await writeAudit({
      actorId: actor.id,
      action: "whitelabel.entitlements.sync",
      detail: { buildId, installationId, activated: result.activated, activeAdditions: result.activeAdditions, totalAdditions: result.totalAdditions },
    });
    revalidateOperations(buildId);
  } catch (error) {
    fail(buildId && isUuid(buildId) ? operationsPath(buildId) : LIST_PATH, error);
  }
  done(operationsPath(buildId), "entitlements-synced");
}
export async function adminScheduleOsUpdate(formData: FormData) {
  const actor = await requireAdmin(LIST_PATH);
  let buildId = "";
  try {
    buildId = buildIdFrom(formData);
    const installationId = uuidField(formData, "installation_id", "Installation");
    const releaseId = uuidField(formData, "release_id", "Release");
    const schedule = scheduledAt(formData.get("scheduled_at") ?? formData.get("scheduled_for"));
    const result = await scheduleUpdateForAdmin({ buildId, installationId, releaseId, scheduledAt: schedule, actorId: actor.id });
    await writeAudit({
      actorId: actor.id,
      action: "whitelabel.update.schedule",
      detail: { buildId, installationId, releaseId, scheduledAt: schedule, rolloutId: result.rolloutId, attemptId: result.attemptId },
    });
    revalidateOperations(buildId);
  } catch (error) {
    fail(buildId && isUuid(buildId) ? operationsPath(buildId) : LIST_PATH, error);
  }
  done(operationsPath(buildId), "update-scheduled");
}

export async function adminAdvanceOsUpdate(formData: FormData) {
  const actor = await requireAdmin(LIST_PATH);
  let buildId = "";
  try {
    buildId = buildIdFrom(formData);
    const attemptId = uuidField(formData, "attempt_id", "Update attempt");
    const port = createUpdateAdminPort(buildId, actor.id);
    await executeNextUpdateStep({ attemptId, store: port });
    const context = await port.loadUpdateContext(attemptId);
    let verificationStatus: "passed" | "blocked" | null = null;
    let versionId: string | null = null;
    if (context.attempt.status === "awaiting_verification" && context.attempt.verificationRunId) {
      verificationStatus = await finalizeOperationalVerificationForAdmin({
        buildId,
        runId: context.attempt.verificationRunId,
        actorId: actor.id,
      });
      if (verificationStatus === "passed") {
        versionId = await finalizeVerifiedUpdate({ attemptId, store: port });
      } else {
        const reason = "Post-update verification blocked version promotion; recovery is required.";
        await port.patchUpdateAttempt(attemptId, { status: "recovery_required", lastError: reason });
        await port.pauseRelease(context.attempt.releaseId, reason);
        await port.recordMaintenanceEvent({
          installationId: context.installation.id,
          updateAttemptId: attemptId,
          eventType: "post_update_verification_failed",
          detail: { verificationRunId: context.attempt.verificationRunId },
        });
      }
    }
    await writeAudit({
      actorId: actor.id,
      action: "whitelabel.update.advance",
      detail: { buildId, attemptId, stage: context.attempt.stage, status: context.attempt.status, verificationStatus, versionId },
    });
    revalidateOperations(buildId);
  } catch (error) {
    fail(buildId && isUuid(buildId) ? operationsPath(buildId) : LIST_PATH, error);
  }
  done(operationsPath(buildId), "update-advanced");
}

export async function adminStartOsRecovery(formData: FormData) {
  const actor = await requireAdmin(LIST_PATH);
  let buildId = "";
  try {
    buildId = buildIdFrom(formData);
    const attemptId = uuidField(formData, "attempt_id", "Update attempt");
    const recoveryRunId = await createRecoveryRunForAdmin({ buildId, attemptId, actorId: actor.id });
    const port = createUpdateAdminPort(buildId, actor.id);
    await executeRecovery({ recoveryRunId, store: port });
    await writeAudit({ actorId: actor.id, action: "whitelabel.update.recovery", detail: { buildId, attemptId, recoveryRunId } });
    revalidateOperations(buildId);
  } catch (error) {
    fail(buildId && isUuid(buildId) ? operationsPath(buildId) : LIST_PATH, error);
  }
  done(operationsPath(buildId), "recovery-advanced");
}

export async function adminCreateOsRelease(formData: FormData) {
  const actor = await requireAdmin(RELEASES_PATH);
  try {
    const snapshot = await createReleaseSnapshot();
    const key = releaseKey(formData.get("release_key"), `${snapshot.schemaRelease}-${snapshot.sourceSha.slice(0, 8)}`);
    const notes = optionalText(formData.get("release_notes"), 4000);
    const releaseId = await createReleaseForAdmin({ releaseKey: key, releaseNotes: notes, actorId: actor.id, snapshot });
    await writeAudit({
      actorId: actor.id,
      action: "whitelabel.release.create",
      detail: { releaseId, releaseKey: key, sourceSha: snapshot.sourceSha, schemaRelease: snapshot.schemaRelease, migrationCount: snapshot.migrations.length },
    });
    revalidatePath(RELEASES_PATH);
  } catch (error) {
    fail(RELEASES_PATH, error);
  }
  done(RELEASES_PATH, "release-created");
}

async function transitionReleaseAction(formData: FormData, target: "ready" | "running" | "completed" | "withdrawn", auditAction: string, okCode: string): Promise<never> {
  const actor = await requireAdmin(RELEASES_PATH);
  try {
    const releaseId = uuidField(formData, "release_id", "Release");
    await transitionReleaseForAdmin({ releaseId, target, actorId: actor.id });
    await writeAudit({ actorId: actor.id, action: auditAction, detail: { releaseId, status: target } });
    revalidatePath(RELEASES_PATH);
  } catch (error) {
    fail(RELEASES_PATH, error);
  }
  done(RELEASES_PATH, okCode);
}

export async function adminMarkOsReleaseReady(formData: FormData) {
  return transitionReleaseAction(formData, "ready", "whitelabel.release.ready", "release-ready");
}

export async function adminResumeOsRelease(formData: FormData) {
  return transitionReleaseAction(formData, "running", "whitelabel.release.resume", "release-resumed");
}

export async function adminCompleteOsRelease(formData: FormData) {
  return transitionReleaseAction(formData, "completed", "whitelabel.release.complete", "release-completed");
}

export async function adminWithdrawOsRelease(formData: FormData) {
  return transitionReleaseAction(formData, "withdrawn", "whitelabel.release.withdraw", "release-withdrawn");
}
