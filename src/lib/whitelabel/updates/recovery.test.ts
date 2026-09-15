import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { UpdateAdminPort } from "./admin";
import { executeRecovery } from "./recovery";
import type { RecoveryExecutionContext } from "./types";

const PRIOR_SHA = "a".repeat(40);
const FAILED_TARGET_SHA = "b".repeat(40);
const FORWARD_SCHEMA = "20260915000200_forward";

function recoveryContext(): RecoveryExecutionContext {
  return {
    installation: {
      id: "installation-1",
      buildId: "build-1",
      osUrl: "https://customer.example",
      managedMode: true,
      vercelTeamId: "team-1",
      vercelProjectRef: "project-1",
      supabaseProjectRef: "supabase-1",
      currentVersionId: "version-1",
      currentSourceSha: PRIOR_SHA,
      currentSchemaRelease: "20260915000100_base",
    },
    attempt: {
      id: "attempt-1",
      installationId: "installation-1",
      releaseId: "release-1",
      status: "recovery_required",
      stage: "verify_live",
      priorVersionId: "version-1",
      priorSourceSha: PRIOR_SHA,
      priorSchemaRelease: "20260915000100_base",
      targetSourceSha: FAILED_TARGET_SHA,
      targetSchemaRelease: FORWARD_SCHEMA,
      deploymentRef: "failed-deployment",
      deploymentUrl: "https://failed.example",
      verificationRunId: null,
      lastError: "failed",
    },
    recovery: { id: "recovery-1", installationId: "installation-1", updateAttemptId: "attempt-1", status: "pending", deploymentRef: null, deploymentUrl: null, lastError: null },
    vercelToken: "vercel-token",
    repoId: "repo-1",
    actualSchemaRelease: FORWARD_SCHEMA,
  };
}

describe("Ticket 6 forward-schema recovery", () => {
  it("redeploys prior source against the actual forward schema and records a recovery version", async () => {
    const ctx = recoveryContext();
    const store = {
      loadRecoveryContext: vi.fn(async () => ctx),
      patchRecoveryRun: vi.fn(async (_id: string, patch: Record<string, unknown>) => Object.assign(ctx.recovery, patch)),
      recordRecoveryVersion: vi.fn(async () => "recovery-version-1"),
      patchUpdateAttempt: vi.fn(async () => undefined),
      recordMaintenanceEvent: vi.fn(async () => undefined),
    } as unknown as UpdateAdminPort;
    const upsertEnv = vi.fn(async () => undefined);
    const deploy = vi.fn(async () => ({ id: "recovery-deployment", url: "https://recovery.example", readyState: "BUILDING" }));
    const getDeployment = vi.fn(async () => ({ id: "recovery-deployment", url: "recovery.example", readyState: "READY" }));
    const verify = vi.fn(async () => ({
      ok: true,
      summary: "matched",
      evidence: { osUrl: ctx.installation.osUrl, expectedSha: PRIOR_SHA, actualSha: PRIOR_SHA, expectedSchema: FORWARD_SCHEMA, actualSchema: FORWARD_SCHEMA },
    }));

    await executeRecovery({
      recoveryRunId: ctx.recovery.id,
      store,
      dependencies: { upsertVercelEnvironment: upsertEnv, createVercelGitDeployment: deploy, getVercelDeployment: getDeployment, verifyLiveInstallationVersion: verify },
    });

    expect(upsertEnv).toHaveBeenCalledWith(expect.objectContaining({ values: [{ key: "INSTALLATION_SCHEMA_RELEASE", value: FORWARD_SCHEMA }] }));
    expect(deploy).toHaveBeenCalledWith(expect.objectContaining({ sourceSha: PRIOR_SHA }));
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ expectedSha: PRIOR_SHA, expectedSchema: FORWARD_SCHEMA }));
    expect(store.recordRecoveryVersion).toHaveBeenCalledWith(expect.objectContaining({ sourceSha: PRIOR_SHA, schemaRelease: FORWARD_SCHEMA }));
    expect(store.patchUpdateAttempt).toHaveBeenCalledWith("attempt-1", expect.objectContaining({ status: "recovered" }));
  });
});
