import type {
  RecoveryExecutionContext,
  ReleaseSnapshot,
  UpdateAttemptPatch,
  UpdateExecutionContext,
} from "./types";
import type { PostUpdateVerification } from "./types";

export const UPDATE_TABLES = {
  installation: "whitelabel_installation",
  installationVersion: "whitelabel_installation_version",
  maintenanceEvent: "whitelabel_maintenance_event",
  installationEntitlement: "whitelabel_installation_entitlement",
  release: "whitelabel_release",
  releaseMigration: "whitelabel_release_migration",
  rollout: "whitelabel_rollout",
  rolloutEntitlement: "whitelabel_rollout_entitlement",
  updateAttempt: "whitelabel_update_attempt",
  recoveryPoint: "whitelabel_recovery_point",
  recoveryRun: "whitelabel_recovery_run",
} as const;

export type VersionPromotionInput = {
  attemptId: string;
  sourceSha: string;
  schemaRelease: string;
  deploymentRef: string | null;
  deploymentUrl: string | null;
};

export type RecoveryVersionInput = {
  recoveryRunId: string;
  updateAttemptId: string;
  sourceSha: string;
  schemaRelease: string;
  deploymentRef: string;
  deploymentUrl: string;
};

/**
 * Ticket 6 domain persistence port. All control-plane table/RPC knowledge stays
 * behind this boundary so the orchestration code never depends on SQL row
 * shapes and cannot accidentally couple customer runtime availability to the
 * Assembly Line database.
 */
export interface UpdateAdminPort {
  loadUpdateContext(attemptId: string): Promise<UpdateExecutionContext>;
  patchUpdateAttempt(attemptId: string, patch: UpdateAttemptPatch): Promise<void>;
  pauseRelease(releaseId: string, reason: string): Promise<void>;
  recordMaintenanceEvent(input: {
    installationId: string;
    updateAttemptId: string;
    eventType: string;
    detail?: Record<string, unknown>;
  }): Promise<void>;
  startPostUpdateVerification(input: {
    installationId: string;
    updateAttemptId: string;
    sourceSha: string;
    schemaRelease: string;
    deploymentUrl: string;
    verification: PostUpdateVerification;
  }): Promise<string>;
  isPostUpdateVerificationPassed(installationId: string, updateAttemptId: string, verificationRunId: string): Promise<boolean>;
  promoteVerifiedVersion(input: VersionPromotionInput): Promise<string>;
  loadRecoveryContext(recoveryRunId: string): Promise<RecoveryExecutionContext>;
  patchRecoveryRun(recoveryRunId: string, patch: {
    status?: "pending" | "running" | "succeeded" | "failed";
    deploymentRef?: string | null;
    deploymentUrl?: string | null;
    lastError?: string | null;
  }): Promise<void>;
  recordRecoveryVersion(input: RecoveryVersionInput): Promise<string>;
}

export type ReleasePersistencePort = {
  findReleaseBySourceSha(sourceSha: string): Promise<{ id: string; sourceSha: string; schemaRelease: string } | null>;
  createRelease(snapshot: ReleaseSnapshot): Promise<{ id: string }>;
};
