import "server-only";

import { verifyLiveInstallationVersion } from "@/lib/whitelabel/verification";
import {
  assertSupabaseProjectHealthy,
  runSupabaseSql,
} from "@/lib/whitelabel/provisioning/supabase-management";
import {
  createVercelGitDeployment,
  getVercelDeployment,
  upsertVercelEnvironment,
} from "@/lib/whitelabel/provisioning/vercel-management";
import type { UpdateAdminPort } from "./admin";
import {
  buildMigrationPlan,
  INSTALLATION_MIGRATION_MARKERS_SQL,
  pinnedMigrationTransactionSql,
  remainingPinnedMigrations,
} from "./release";
import type { ReleaseMigrationSnapshot, UpdateExecutionContext } from "./types";
import { buildPostUpdateVerification } from "./verification";

type Dependencies = {
  assertSupabaseProjectHealthy: typeof assertSupabaseProjectHealthy;
  runSupabaseSql: typeof runSupabaseSql;
  upsertVercelEnvironment: typeof upsertVercelEnvironment;
  createVercelGitDeployment: typeof createVercelGitDeployment;
  getVercelDeployment: typeof getVercelDeployment;
  verifyLiveInstallationVersion: typeof verifyLiveInstallationVersion;
  now: () => Date;
};

const defaults: Dependencies = {
  assertSupabaseProjectHealthy,
  runSupabaseSql,
  upsertVercelEnvironment,
  createVercelGitDeployment,
  getVercelDeployment,
  verifyLiveInstallationVersion,
  now: () => new Date(),
};

function queryRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
  if (value && typeof value === "object") {
    for (const key of ["data", "result", "rows"]) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return queryRows(candidate);
    }
  }
  return [];
}

function markerNames(value: unknown): string[] {
  return queryRows(value)
    .map((row) => row.migration_name)
    .filter((name): name is string => typeof name === "string" && Boolean(name));
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Managed update failed unexpectedly.";
  if (/bearer\s+|(?:api[_ -]?key|secret|token|password)\s*[:=]|sb_secret_|sbp_|sk-|re_[A-Za-z0-9]/i.test(raw)) {
    return "Managed update provider operation failed. Re-check the customer provider access before retrying recovery.";
  }
  return raw.slice(0, 1000);
}

class UpdateDeferredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateDeferredError";
  }
}

function assertAttemptPins(ctx: UpdateExecutionContext): void {
  if (ctx.attempt.installationId !== ctx.installation.id) throw new Error("Update attempt installation does not match its execution context.");
  if (ctx.currentVersion.id !== ctx.attempt.priorVersionId) throw new Error("Update attempt is no longer pinned to the recorded current version.");
  if (ctx.currentVersion.sourceSha !== ctx.attempt.priorSourceSha || ctx.currentVersion.schemaRelease !== ctx.attempt.priorSchemaRelease) {
    throw new Error("Current installation version changed after this update attempt was scheduled.");
  }
  if (ctx.release.sourceSha !== ctx.attempt.targetSourceSha || ctx.release.schemaRelease !== ctx.attempt.targetSchemaRelease) {
    throw new Error("Selected release no longer matches the immutable update attempt pins.");
  }
}

function assertManagedGates(ctx: UpdateExecutionContext, now: Date): void {
  if (!ctx.installation.managedMode) throw new UpdateDeferredError("Installation is in independent mode; compatibility/rejoin must pass before managed updates resume.");
  if (!ctx.maintenance.active) throw new UpdateDeferredError("Active maintenance is required for managed updates.");
  if (!ctx.maintenance.entitlementsCompatible) throw new UpdateDeferredError("Installation entitlements are incompatible with this release.");
  if (!ctx.maintenance.noticeSentAt) throw new UpdateDeferredError("Customer update notice must be recorded before preflight.");
  if (!ctx.maintenance.scheduledFor) throw new UpdateDeferredError("Managed update must have a recorded schedule before preflight.");
  if (ctx.releaseStatus !== "ready" && ctx.releaseStatus !== "running") {
    throw new UpdateDeferredError(`Managed release is ${ctx.releaseStatus}; rollout mutation is paused.`);
  }
  if (ctx.releaseMutationBlocked) {
    throw new UpdateDeferredError("Another installation is currently mutating under this release; this rollout remains queued.");
  }
  const scheduled = new Date(ctx.maintenance.scheduledFor);
  if (!Number.isFinite(scheduled.getTime())) throw new UpdateDeferredError("Managed update schedule is invalid.");
  if (scheduled.getTime() > now.getTime()) throw new UpdateDeferredError("Managed update is scheduled for a future time.");
}

async function readMarkers(ctx: UpdateExecutionContext, deps: Dependencies): Promise<string[]> {
  const result = await deps.runSupabaseSql({
    token: ctx.supabaseToken,
    projectRef: ctx.installation.supabaseProjectRef,
    query: INSTALLATION_MIGRATION_MARKERS_SQL,
  });
  return markerNames(result);
}

async function executePreflight(ctx: UpdateExecutionContext, deps: Dependencies): Promise<void> {
  assertAttemptPins(ctx);
  assertManagedGates(ctx, deps.now());
  await deps.assertSupabaseProjectHealthy({ token: ctx.supabaseToken, projectRef: ctx.installation.supabaseProjectRef, services: ["db"] });
  const [liveVersion, markers] = await Promise.all([
    deps.verifyLiveInstallationVersion({
      osUrl: ctx.installation.osUrl,
      expectedSha: ctx.attempt.priorSourceSha,
      expectedSchema: ctx.attempt.priorSchemaRelease,
    }),
    readMarkers(ctx, deps),
  ]);
  if (!liveVersion.ok) throw new Error(`Preflight live-version drift: ${liveVersion.summary}`);
  buildMigrationPlan({ release: ctx.release, installedSchemaRelease: ctx.attempt.priorSchemaRelease, actualMarkers: markers });
}

async function nextPinnedMigration(ctx: UpdateExecutionContext, deps: Dependencies): Promise<{ migration: ReleaseMigrationSnapshot | null; markers: string[] }> {
  const markers = await readMarkers(ctx, deps);
  const remaining = remainingPinnedMigrations({
    release: ctx.release,
    installedSchemaRelease: ctx.attempt.priorSchemaRelease,
    actualMarkers: markers,
  });
  return { migration: remaining[0] ?? null, markers };
}

async function failForRecovery(store: UpdateAdminPort, ctx: UpdateExecutionContext, error: unknown): Promise<void> {
  const message = safeError(error);
  await Promise.all([
    store.patchUpdateAttempt(ctx.attempt.id, { status: "recovery_required", lastError: message }),
    store.pauseRelease(ctx.attempt.releaseId, message),
    store.recordMaintenanceEvent({
      installationId: ctx.installation.id,
      updateAttemptId: ctx.attempt.id,
      eventType: "update_failed_recovery_required",
      detail: { stage: ctx.attempt.stage, message },
    }),
  ]);
}

export async function executeNextUpdateStep(args: {
  attemptId: string;
  store: UpdateAdminPort;
  dependencies?: Partial<Dependencies>;
}): Promise<void> {
  const deps = { ...defaults, ...args.dependencies };
  const ctx = await args.store.loadUpdateContext(args.attemptId);
  if (["succeeded", "recovered", "cancelled", "recovery_required", "paused"].includes(ctx.attempt.status)) return;
  if (ctx.attempt.stage === "awaiting_verification") return;

  try {
    switch (ctx.attempt.stage) {
      case "preflight": {
        await executePreflight(ctx, deps);
        await args.store.recordMaintenanceEvent({ installationId: ctx.installation.id, updateAttemptId: ctx.attempt.id, eventType: "preflight_passed" });
        await args.store.patchUpdateAttempt(ctx.attempt.id, { status: "running", stage: "apply_migrations", lastError: null });
        return;
      }
      case "apply_migrations": {
        const { migration } = await nextPinnedMigration(ctx, deps);
        if (!migration) {
          await args.store.patchUpdateAttempt(ctx.attempt.id, { stage: "set_schema_environment", lastError: null });
          return;
        }
        await deps.runSupabaseSql({
          token: ctx.supabaseToken,
          projectRef: ctx.installation.supabaseProjectRef,
          query: pinnedMigrationTransactionSql(migration),
        });
        await args.store.recordMaintenanceEvent({
          installationId: ctx.installation.id,
          updateAttemptId: ctx.attempt.id,
          eventType: "migration_applied",
          detail: { migrationName: migration.migrationName, sqlSha256: migration.sqlSha256 },
        });
        return;
      }
      case "set_schema_environment": {
        await deps.upsertVercelEnvironment({
          token: ctx.vercelToken,
          teamId: ctx.installation.vercelTeamId,
          projectRef: ctx.installation.vercelProjectRef,
          values: [{ key: "INSTALLATION_SCHEMA_RELEASE", value: ctx.release.schemaRelease }],
        });
        await args.store.patchUpdateAttempt(ctx.attempt.id, { stage: "deploy_source", lastError: null });
        return;
      }
      case "deploy_source": {
        const created = await deps.createVercelGitDeployment({
          token: ctx.vercelToken,
          teamId: ctx.installation.vercelTeamId,
          projectRef: ctx.installation.vercelProjectRef,
          projectName: new URL(ctx.installation.osUrl).hostname.slice(0, 100),
          repoId: ctx.repoId,
          sourceSha: ctx.release.sourceSha,
        });
        await args.store.patchUpdateAttempt(ctx.attempt.id, {
          stage: "poll_deployment",
          deploymentRef: created.id,
          deploymentUrl: created.url,
          lastError: null,
        });
        return;
      }
      case "poll_deployment": {
        if (!ctx.attempt.deploymentRef) throw new Error("Update deployment reference is missing.");
        const deployment = await deps.getVercelDeployment({ token: ctx.vercelToken, teamId: ctx.installation.vercelTeamId, deploymentRef: ctx.attempt.deploymentRef });
        const state = (deployment.readyState ?? "").toUpperCase();
        if (state === "ERROR" || state === "CANCELED") throw new Error(`Vercel update deployment ended in ${state}.`);
        if (state !== "READY") return;
        await args.store.patchUpdateAttempt(ctx.attempt.id, {
          stage: "verify_live",
          deploymentRef: deployment.id,
          deploymentUrl: deployment.url ? `https://${deployment.url.replace(/^https?:\/\//, "")}` : ctx.attempt.deploymentUrl,
          lastError: null,
        });
        return;
      }
      case "verify_live": {
        const live = await deps.verifyLiveInstallationVersion({
          osUrl: ctx.installation.osUrl,
          expectedSha: ctx.release.sourceSha,
          expectedSchema: ctx.release.schemaRelease,
        });
        if (!live.ok) throw new Error(`Updated live version did not match the exact release: ${live.summary}`);
        await args.store.patchUpdateAttempt(ctx.attempt.id, { stage: "start_post_update_verification", lastError: null });
        return;
      }
      case "start_post_update_verification": {
        const markers = await readMarkers(ctx, deps);
        const live = await deps.verifyLiveInstallationVersion({
          osUrl: ctx.installation.osUrl,
          expectedSha: ctx.release.sourceSha,
          expectedSchema: ctx.release.schemaRelease,
        });
        const verification = buildPostUpdateVerification({
          liveVersion: live,
          expectedMigrationNames: ctx.release.migrations.map((migration) => migration.migrationName),
          actualMigrationNames: markers,
        });
        const runId = await args.store.startPostUpdateVerification({
          installationId: ctx.installation.id,
          updateAttemptId: ctx.attempt.id,
          sourceSha: ctx.release.sourceSha,
          schemaRelease: ctx.release.schemaRelease,
          deploymentUrl: ctx.attempt.deploymentUrl ?? ctx.installation.osUrl,
          verification,
        });
        await args.store.patchUpdateAttempt(ctx.attempt.id, {
          status: "awaiting_verification",
          stage: "awaiting_verification",
          verificationRunId: runId,
          lastError: null,
        });
        return;
      }
    }
  } catch (error) {
    if (ctx.attempt.stage === "preflight") {
      const message = safeError(error);
      await args.store.patchUpdateAttempt(ctx.attempt.id, { lastError: message });
      if (!(error instanceof UpdateDeferredError)) {
        await Promise.all([
          args.store.pauseRelease(ctx.attempt.releaseId, message),
          args.store.recordMaintenanceEvent({
            installationId: ctx.installation.id,
            updateAttemptId: ctx.attempt.id,
            eventType: "preflight_failed_release_paused",
            detail: { stage: ctx.attempt.stage, message },
          }),
        ]);
      }
      return;
    }
    await failForRecovery(args.store, ctx, error);
  }
}

export async function finalizeVerifiedUpdate(args: { attemptId: string; store: UpdateAdminPort }): Promise<string | null> {
  const ctx = await args.store.loadUpdateContext(args.attemptId);
  if (ctx.attempt.status === "succeeded") return ctx.installation.currentVersionId;
  if (ctx.attempt.status !== "awaiting_verification" || !ctx.attempt.verificationRunId) {
    throw new Error("Update attempt is not awaiting post-update verification.");
  }
  const passed = await args.store.isPostUpdateVerificationPassed(ctx.installation.id, ctx.attempt.id, ctx.attempt.verificationRunId);
  if (!passed) return null;
  const versionId = await args.store.promoteVerifiedVersion({
    attemptId: ctx.attempt.id,
    sourceSha: ctx.release.sourceSha,
    schemaRelease: ctx.release.schemaRelease,
    deploymentRef: ctx.attempt.deploymentRef,
    deploymentUrl: ctx.attempt.deploymentUrl,
  });
  await args.store.patchUpdateAttempt(ctx.attempt.id, { status: "succeeded", lastError: null });
  await args.store.recordMaintenanceEvent({ installationId: ctx.installation.id, updateAttemptId: ctx.attempt.id, eventType: "update_verified_promoted", detail: { versionId } });
  return versionId;
}
