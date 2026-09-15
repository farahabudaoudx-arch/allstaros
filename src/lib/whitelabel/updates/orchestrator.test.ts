import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { UpdateAdminPort } from "./admin";
import { executeNextUpdateStep, finalizeVerifiedUpdate } from "./orchestrator";
import type { ReleaseSnapshot, UpdateExecutionContext } from "./types";

const PRIOR_SHA = "a".repeat(40);
const TARGET_SHA = "b".repeat(40);
const BASE_MIGRATION = "20260915000100_base.sql";
const TARGET_MIGRATION = "20260915000200_target.sql";

function release(): ReleaseSnapshot {
  return {
    sourceSha: TARGET_SHA,
    schemaRelease: TARGET_MIGRATION.slice(0, -4),
    migrations: [
      { ordinal: 1, migrationName: BASE_MIGRATION, schemaRelease: BASE_MIGRATION.slice(0, -4), sqlSha256: "1".repeat(64), sql: "create table if not exists public.base(id uuid primary key);" },
      { ordinal: 2, migrationName: TARGET_MIGRATION, schemaRelease: TARGET_MIGRATION.slice(0, -4), sqlSha256: "2".repeat(64), sql: "alter table public.base add column if not exists note text;" },
    ],
  };
}

function context(stage: UpdateExecutionContext["attempt"]["stage"]): UpdateExecutionContext {
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
      currentSchemaRelease: BASE_MIGRATION.slice(0, -4),
    },
    currentVersion: {
      id: "version-1",
      installationId: "installation-1",
      sourceSha: PRIOR_SHA,
      schemaRelease: BASE_MIGRATION.slice(0, -4),
      deploymentRef: "old-deployment",
      deploymentUrl: "https://old.example",
      origin: "handoff",
      createdAt: "2026-09-14T00:00:00Z",
    },
    attempt: {
      id: "attempt-1",
      installationId: "installation-1",
      releaseId: "release-1",
      status: "running",
      stage,
      priorVersionId: "version-1",
      priorSourceSha: PRIOR_SHA,
      priorSchemaRelease: BASE_MIGRATION.slice(0, -4),
      targetSourceSha: TARGET_SHA,
      targetSchemaRelease: TARGET_MIGRATION.slice(0, -4),
      deploymentRef: stage === "poll_deployment" || stage === "verify_live" || stage === "start_post_update_verification" ? "deployment-2" : null,
      deploymentUrl: stage === "poll_deployment" || stage === "verify_live" || stage === "start_post_update_verification" ? "https://new.example" : null,
      verificationRunId: null,
      lastError: null,
    },
    release: release(),
    releaseStatus: "ready",
    releaseMutationBlocked: false,
    maintenance: { active: true, entitlementsCompatible: true, noticeSentAt: "2026-09-15T08:00:00Z", scheduledFor: "2026-09-15T09:00:00Z" },
    vercelToken: "vercel-token",
    supabaseToken: "supabase-token",
    repoId: "repo-1",
  };
}

function storeFor(ctx: UpdateExecutionContext) {
  const store = {
    loadUpdateContext: vi.fn(async () => ctx),
    patchUpdateAttempt: vi.fn(async (_id: string, patch: Record<string, unknown>) => Object.assign(ctx.attempt, patch)),
    pauseRelease: vi.fn(async () => undefined),
    recordMaintenanceEvent: vi.fn(async () => undefined),
    startPostUpdateVerification: vi.fn(async () => "verification-1"),
    isPostUpdateVerificationPassed: vi.fn(async () => false),
    promoteVerifiedVersion: vi.fn(async () => "version-2"),
    loadRecoveryContext: vi.fn(),
    patchRecoveryRun: vi.fn(),
    recordRecoveryVersion: vi.fn(),
  } as unknown as UpdateAdminPort;
  return store;
}

function liveOk(sha: string, schema: string) {
  return {
    ok: true,
    summary: "matched",
    evidence: { osUrl: "https://customer.example", expectedSha: sha, actualSha: sha, expectedSchema: schema, actualSchema: schema },
  };
}

describe("Ticket 6 update orchestrator", () => {
  it("blocks drift during preflight before any environment or deployment mutation", async () => {
    const ctx = context("preflight");
    const store = storeFor(ctx);
    const upsertEnv = vi.fn();
    const deploy = vi.fn();
    await executeNextUpdateStep({
      attemptId: ctx.attempt.id,
      store,
      dependencies: {
        now: () => new Date("2026-09-15T10:00:00Z"),
        assertSupabaseProjectHealthy: vi.fn(async () => undefined),
        runSupabaseSql: vi.fn(async () => [{ migration_name: BASE_MIGRATION }, { migration_name: "customer-hotfix.sql" }]),
        verifyLiveInstallationVersion: vi.fn(async () => liveOk(PRIOR_SHA, ctx.attempt.priorSchemaRelease)),
        upsertVercelEnvironment: upsertEnv,
        createVercelGitDeployment: deploy,
      },
    });
    expect(store.patchUpdateAttempt).toHaveBeenCalledWith(ctx.attempt.id, expect.objectContaining({ lastError: expect.any(String) }));
    expect(store.patchUpdateAttempt).not.toHaveBeenCalledWith(ctx.attempt.id, expect.objectContaining({ status: "recovery_required" }));
    expect(store.pauseRelease).toHaveBeenCalledWith("release-1", expect.any(String));
    expect(upsertEnv).not.toHaveBeenCalled();
    expect(deploy).not.toHaveBeenCalled();
  });

  it("defers before the scheduled time without pausing the release or requiring recovery", async () => {
    const ctx = context("preflight");
    const store = storeFor(ctx);
    await executeNextUpdateStep({
      attemptId: ctx.attempt.id,
      store,
      dependencies: { now: () => new Date("2026-09-15T08:30:00Z") },
    });
    expect(store.patchUpdateAttempt).toHaveBeenCalledWith(ctx.attempt.id, expect.objectContaining({ lastError: expect.stringMatching(/future time/i) }));
    expect(store.pauseRelease).not.toHaveBeenCalled();
    expect(store.patchUpdateAttempt).not.toHaveBeenCalledWith(ctx.attempt.id, expect.objectContaining({ status: "recovery_required" }));
  });

  it("defers when a prior customer failure has paused the release", async () => {
    const ctx = context("preflight");
    ctx.releaseStatus = "paused";
    const store = storeFor(ctx);
    await executeNextUpdateStep({
      attemptId: ctx.attempt.id,
      store,
      dependencies: { now: () => new Date("2026-09-15T10:00:00Z") },
    });
    expect(store.patchUpdateAttempt).toHaveBeenCalledWith(ctx.attempt.id, expect.objectContaining({ lastError: expect.stringMatching(/release is paused/i) }));
    expect(store.pauseRelease).not.toHaveBeenCalled();
    expect(store.patchUpdateAttempt).not.toHaveBeenCalledWith(ctx.attempt.id, expect.objectContaining({ status: "recovery_required" }));
  });

  it("defers while another installation owns the release mutation slot", async () => {
    const ctx = context("preflight");
    ctx.releaseMutationBlocked = true;
    const store = storeFor(ctx);
    await executeNextUpdateStep({
      attemptId: ctx.attempt.id,
      store,
      dependencies: { now: () => new Date("2026-09-15T10:00:00Z") },
    });
    expect(store.patchUpdateAttempt).toHaveBeenCalledWith(ctx.attempt.id, expect.objectContaining({ lastError: expect.stringMatching(/currently mutating/i) }));
    expect(store.pauseRelease).not.toHaveBeenCalled();
    expect(store.patchUpdateAttempt).not.toHaveBeenCalledWith(ctx.attempt.id, expect.objectContaining({ status: "running" }));
  });

  it("applies exactly one missing pinned migration and never invokes clean/reset SQL", async () => {
    const ctx = context("apply_migrations");
    const store = storeFor(ctx);
    const runSql = vi.fn()
      .mockResolvedValueOnce([{ migration_name: BASE_MIGRATION }])
      .mockResolvedValueOnce([]);
    await executeNextUpdateStep({ attemptId: ctx.attempt.id, store, dependencies: { runSupabaseSql: runSql } });
    expect(runSql).toHaveBeenCalledTimes(2);
    const appliedSql = String(runSql.mock.calls[1][0].query);
    expect(appliedSql).toContain(TARGET_MIGRATION);
    expect(appliedSql).toContain("installation_schema_migration");
    expect(appliedSql).not.toMatch(/\btruncate\b|\bdelete\s+from\b|drop\s+table|drop\s+column/i);
    expect(store.patchUpdateAttempt).not.toHaveBeenCalledWith(ctx.attempt.id, expect.objectContaining({ stage: "set_schema_environment" }));
  });

  it("sets only the target schema environment before deploying the exact pinned source", async () => {
    const envCtx = context("set_schema_environment");
    const envStore = storeFor(envCtx);
    const upsertEnv = vi.fn(async () => undefined);
    await executeNextUpdateStep({ attemptId: envCtx.attempt.id, store: envStore, dependencies: { upsertVercelEnvironment: upsertEnv } });
    expect(upsertEnv).toHaveBeenCalledWith(expect.objectContaining({
      values: [{ key: "INSTALLATION_SCHEMA_RELEASE", value: release().schemaRelease }],
    }));

    const deployCtx = context("deploy_source");
    const deployStore = storeFor(deployCtx);
    const deploy = vi.fn(async () => ({ id: "deployment-2", url: "https://new.example", readyState: "BUILDING" }));
    await executeNextUpdateStep({ attemptId: deployCtx.attempt.id, store: deployStore, dependencies: { createVercelGitDeployment: deploy } });
    expect(deploy).toHaveBeenCalledWith(expect.objectContaining({ sourceSha: TARGET_SHA }));
    expect(deployStore.promoteVerifiedVersion).not.toHaveBeenCalled();
  });

  it("starts post_update verification after exact live verification and never promotes early", async () => {
    const ctx = context("start_post_update_verification");
    const store = storeFor(ctx);
    await executeNextUpdateStep({
      attemptId: ctx.attempt.id,
      store,
      dependencies: {
        runSupabaseSql: vi.fn(async () => [{ migration_name: BASE_MIGRATION }, { migration_name: TARGET_MIGRATION }]),
        verifyLiveInstallationVersion: vi.fn(async () => liveOk(TARGET_SHA, release().schemaRelease)),
      },
    });
    expect(store.startPostUpdateVerification).toHaveBeenCalledWith(expect.objectContaining({ sourceSha: TARGET_SHA, schemaRelease: release().schemaRelease }));
    expect(store.patchUpdateAttempt).toHaveBeenCalledWith(ctx.attempt.id, expect.objectContaining({ status: "awaiting_verification", verificationRunId: "verification-1" }));
    expect(store.promoteVerifiedVersion).not.toHaveBeenCalled();
  });

  it("promotes current version only after the post_update verification is passed", async () => {
    const ctx = context("awaiting_verification");
    ctx.attempt.status = "awaiting_verification";
    ctx.attempt.verificationRunId = "verification-1";
    const store = storeFor(ctx);
    expect(await finalizeVerifiedUpdate({ attemptId: ctx.attempt.id, store })).toBeNull();
    expect(store.promoteVerifiedVersion).not.toHaveBeenCalled();
    (store.isPostUpdateVerificationPassed as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    expect(await finalizeVerifiedUpdate({ attemptId: ctx.attempt.id, store })).toBe("version-2");
    expect(store.promoteVerifiedVersion).toHaveBeenCalledWith(expect.objectContaining({ sourceSha: TARGET_SHA, schemaRelease: release().schemaRelease }));
  });
});
