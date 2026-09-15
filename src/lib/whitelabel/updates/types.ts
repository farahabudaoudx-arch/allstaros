export const UPDATE_STAGES = [
  "preflight",
  "apply_migrations",
  "set_schema_environment",
  "deploy_source",
  "poll_deployment",
  "verify_live",
  "start_post_update_verification",
  "awaiting_verification",
] as const;

export type UpdateStage = (typeof UPDATE_STAGES)[number];

export type UpdateAttemptStatus =
  | "scheduled"
  | "running"
  | "awaiting_verification"
  | "succeeded"
  | "paused"
  | "recovery_required"
  | "recovered"
  | "cancelled";

export type ReleaseMigrationSnapshot = {
  ordinal: number;
  migrationName: string;
  schemaRelease: string;
  sqlSha256: string;
  sql: string;
};

export type ReleaseSnapshot = {
  sourceSha: string;
  schemaRelease: string;
  migrations: ReleaseMigrationSnapshot[];
};

export type InstallationRecord = {
  id: string;
  buildId: string;
  osUrl: string;
  managedMode: boolean;
  vercelTeamId: string;
  vercelProjectRef: string;
  supabaseProjectRef: string;
  currentVersionId: string | null;
  currentSourceSha: string;
  currentSchemaRelease: string;
};

export type InstallationVersionRecord = {
  id: string;
  installationId: string;
  sourceSha: string;
  schemaRelease: string;
  deploymentRef: string | null;
  deploymentUrl: string | null;
  origin: "handoff" | "update" | "recovery" | "adopted";
  createdAt: string;
};

export type MaintenanceGate = {
  active: boolean;
  entitlementsCompatible: boolean;
  noticeSentAt: string | null;
  scheduledFor: string | null;
};

export type UpdateAttemptRecord = {
  id: string;
  installationId: string;
  releaseId: string;
  status: UpdateAttemptStatus;
  stage: UpdateStage;
  priorVersionId: string;
  priorSourceSha: string;
  priorSchemaRelease: string;
  targetSourceSha: string;
  targetSchemaRelease: string;
  deploymentRef: string | null;
  deploymentUrl: string | null;
  verificationRunId: string | null;
  lastError: string | null;
};

export type UpdateExecutionContext = {
  installation: InstallationRecord;
  currentVersion: InstallationVersionRecord;
  attempt: UpdateAttemptRecord;
  release: ReleaseSnapshot;
  releaseStatus: "draft" | "ready" | "running" | "paused" | "completed" | "withdrawn";
  releaseMutationBlocked: boolean;
  maintenance: MaintenanceGate;
  vercelToken: string;
  supabaseToken: string;
  repoId: string;
};

export type UpdateAttemptPatch = Partial<Pick<
  UpdateAttemptRecord,
  "status" | "stage" | "deploymentRef" | "deploymentUrl" | "verificationRunId" | "lastError"
>>;

export type OperationalVerificationItem = {
  checkKey: string;
  label: string;
  category: "operations" | "access" | "scope";
  mode: "automated" | "manual";
  required: boolean;
  status: "pending" | "passed" | "failed" | "not_applicable";
  expectedSummary: string;
  actualSummary?: string;
  evidence?: Record<string, unknown>;
};

export type CompatibilityVerification = {
  kind: "compatibility";
  compatible: boolean;
  items: OperationalVerificationItem[];
};

export type PostUpdateVerification = {
  kind: "post_update";
  items: OperationalVerificationItem[];
};

export type RecoveryRecord = {
  id: string;
  installationId: string;
  updateAttemptId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  deploymentRef: string | null;
  deploymentUrl: string | null;
  lastError: string | null;
};

export type RecoveryExecutionContext = {
  installation: InstallationRecord;
  attempt: UpdateAttemptRecord;
  recovery: RecoveryRecord;
  vercelToken: string;
  repoId: string;
  actualSchemaRelease: string;
};
