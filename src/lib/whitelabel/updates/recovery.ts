import "server-only";

import { verifyLiveInstallationVersion } from "@/lib/whitelabel/verification";
import {
  createVercelGitDeployment,
  getVercelDeployment,
  upsertVercelEnvironment,
} from "@/lib/whitelabel/provisioning/vercel-management";
import type { UpdateAdminPort } from "./admin";
import { exactSourceSha } from "./release";

type RecoveryDependencies = {
  upsertVercelEnvironment: typeof upsertVercelEnvironment;
  createVercelGitDeployment: typeof createVercelGitDeployment;
  getVercelDeployment: typeof getVercelDeployment;
  verifyLiveInstallationVersion: typeof verifyLiveInstallationVersion;
};

const defaults: RecoveryDependencies = {
  upsertVercelEnvironment,
  createVercelGitDeployment,
  getVercelDeployment,
  verifyLiveInstallationVersion,
};

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Recovery failed unexpectedly.").slice(0, 1000);
}

/**
 * Recovery is intentionally app-forward only: the prior application source is
 * redeployed against the database schema that actually exists after the failed
 * update. This module never executes SQL, restores a snapshot, or removes newer
 * customer rows.
 */
export async function executeRecovery(args: {
  recoveryRunId: string;
  store: UpdateAdminPort;
  dependencies?: Partial<RecoveryDependencies>;
}): Promise<void> {
  const deps = { ...defaults, ...args.dependencies };
  const ctx = await args.store.loadRecoveryContext(args.recoveryRunId);
  if (ctx.recovery.status === "succeeded") return;
  const priorSourceSha = exactSourceSha(ctx.attempt.priorSourceSha);
  try {
    await args.store.patchRecoveryRun(ctx.recovery.id, { status: "running", lastError: null });
    await deps.upsertVercelEnvironment({
      token: ctx.vercelToken,
      teamId: ctx.installation.vercelTeamId,
      projectRef: ctx.installation.vercelProjectRef,
      values: [{ key: "INSTALLATION_SCHEMA_RELEASE", value: ctx.actualSchemaRelease }],
    });

    let deploymentRef = ctx.recovery.deploymentRef;
    let deploymentUrl = ctx.recovery.deploymentUrl;
    if (!deploymentRef) {
      const created = await deps.createVercelGitDeployment({
        token: ctx.vercelToken,
        teamId: ctx.installation.vercelTeamId,
        projectRef: ctx.installation.vercelProjectRef,
        projectName: new URL(ctx.installation.osUrl).hostname.slice(0, 100),
        repoId: ctx.repoId,
        sourceSha: priorSourceSha,
      });
      deploymentRef = created.id;
      deploymentUrl = created.url;
      await args.store.patchRecoveryRun(ctx.recovery.id, { deploymentRef, deploymentUrl, lastError: null });
    }

    const deployment = await deps.getVercelDeployment({ token: ctx.vercelToken, teamId: ctx.installation.vercelTeamId, deploymentRef });
    const state = (deployment.readyState ?? "").toUpperCase();
    if (state === "ERROR" || state === "CANCELED") throw new Error(`Vercel recovery deployment ended in ${state}.`);
    if (state !== "READY") return;
    deploymentUrl = deployment.url ? `https://${deployment.url.replace(/^https?:\/\//, "")}` : deploymentUrl;

    const live = await deps.verifyLiveInstallationVersion({
      osUrl: ctx.installation.osUrl,
      expectedSha: priorSourceSha,
      expectedSchema: ctx.actualSchemaRelease,
    });
    if (!live.ok) throw new Error(`Recovery deployment did not match prior source + forward schema: ${live.summary}`);

    const versionId = await args.store.recordRecoveryVersion({
      recoveryRunId: ctx.recovery.id,
      updateAttemptId: ctx.attempt.id,
      sourceSha: priorSourceSha,
      schemaRelease: ctx.actualSchemaRelease,
      deploymentRef,
      deploymentUrl: deploymentUrl ?? ctx.installation.osUrl,
    });
    await Promise.all([
      args.store.patchRecoveryRun(ctx.recovery.id, { status: "succeeded", deploymentRef, deploymentUrl, lastError: null }),
      args.store.patchUpdateAttempt(ctx.attempt.id, { status: "recovered", lastError: null }),
      args.store.recordMaintenanceEvent({ installationId: ctx.installation.id, updateAttemptId: ctx.attempt.id, eventType: "recovery_succeeded", detail: { versionId, schemaRelease: ctx.actualSchemaRelease } }),
    ]);
  } catch (error) {
    const message = safeError(error);
    await args.store.patchRecoveryRun(ctx.recovery.id, { status: "failed", lastError: message });
    await args.store.recordMaintenanceEvent({ installationId: ctx.installation.id, updateAttemptId: ctx.attempt.id, eventType: "recovery_failed", detail: { message } });
  }
}
