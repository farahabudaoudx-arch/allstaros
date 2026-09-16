import "server-only";

import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runSupabaseSql } from "@/lib/whitelabel/provisioning/supabase-management";
import { CLEAN_CUSTOMER_MIGRATIONS } from "@/lib/whitelabel/provisioning/clean-schema";
import {
  buildMigrationPlan,
  INSTALLATION_MIGRATION_MARKERS_SQL,
  migrationSchemaRelease,
  sha256,
} from "./release";
import type {
  CompatibilityVerification,
  InstallationRecord,
  InstallationVersionRecord,
  OperationalVerificationItem,
  RecoveryExecutionContext,
  RecoveryRecord,
  ReleaseMigrationSnapshot,
  ReleaseSnapshot,
  UpdateAttemptPatch,
  UpdateAttemptRecord,
  UpdateExecutionContext,
  UpdateStage,
} from "./types";
import type {
  RecoveryVersionInput,
  UpdateAdminPort,
  VersionPromotionInput,
} from "./admin";

type AdminClient = ReturnType<typeof createServiceRoleClient>;
type DbRow = Record<string, unknown>;

const ACTIVE_ROLLOUT_STATUSES = ["queued", "notified", "running", "verifying", "recovering"] as const;
type ReleaseStatus = "draft" | "ready" | "running" | "paused" | "completed" | "withdrawn";
type MaintenanceStatus = "active" | "declined" | "paused" | "ended";

export type OperationsInstallationRow = {
  id: string;
  build_id: string;
  handoff_id: string;
  operation_mode: "managed" | "independent" | "rejoining";
  maintenance_status: "active" | "declined" | "paused" | "ended";
  current_version_id: string | null;
  independent_since: string | null;
  rejoin_started_at: string | null;
  rejoined_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OperationsVersionRow = {
  id: string;
  installation_id: string;
  build_id: string;
  ordinal: number;
  source_sha: string;
  schema_release: string;
  deployment_url: string;
  deployment_ref: string | null;
  origin_kind: "handoff" | "update" | "recovery";
  handoff_id: string | null;
  update_attempt_id: string | null;
  recovery_run_id: string | null;
  promoted_at: string;
  safe_metadata: Record<string, unknown>;
};

export type MaintenanceEventRow = {
  id: string;
  installation_id: string;
  build_id: string;
  update_attempt_id: string | null;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  recorded_at: string;
  detail: Record<string, unknown>;
};

export type EntitlementRow = {
  id: string;
  installation_id: string;
  build_id: string;
  entitlement_key: string;
  source_kind: "base" | "addition";
  addition_id: string | null;
  name: string;
  status: "pending_delivery" | "active" | "suspended" | "ended";
  preservation_notes: string | null;
  safe_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ReleaseRow = {
  id: string;
  release_key: string;
  source_sha: string;
  schema_release: string;
  status: ReleaseStatus;
  release_notes: string | null;
  safe_metadata: Record<string, unknown>;
  ready_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RolloutRow = {
  id: string;
  installation_id: string;
  build_id: string;
  release_id: string;
  from_version_id: string;
  status: "queued" | "notified" | "running" | "verifying" | "succeeded" | "failed" | "recovering" | "recovered" | "cancelled";
  notification_at: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type OperationsRolloutRow = RolloutRow & {
  attempt: DbRow | null;
  recovery: DbRow | null;
  update_attempt_id: string | null;
  attempt_status: string | null;
  attempt_stage: string | null;
  recovery_status: string | null;
};

export type OperationsAdminView = {
  available: boolean;
  installation: OperationsInstallationRow | null;
  currentVersion: OperationsVersionRow | null;
  versions: OperationsVersionRow[];
  maintenanceEvents: MaintenanceEventRow[];
  entitlements: EntitlementRow[];
  rollouts: OperationsRolloutRow[];
  releases: ReleaseRow[];
  activeRollout: OperationsRolloutRow | null;
};

export type ReleaseAdminSummary = ReleaseRow & {
  migration_count: number;
  rollout_total: number;
  rollout_counts: Record<string, number>;
};

export type ReleasesAdminView = {
  available: boolean;
  releases: ReleaseAdminSummary[];
};

export type CompatibilityEvidence = {
  installation: OperationsInstallationRow;
  currentVersion: OperationsVersionRow;
  osUrl: string;
  knownSourceShas: string[];
  knownSchemaReleases: string[];
  knownMigrationNames: string[];
  actualMigrationNames: string[];
  providerRefsMatch: boolean;
};

export type ScheduledUpdate = {
  rolloutId: string;
  attemptId: string;
  recoveryPointId: string;
};

function emptyOperationsView(): OperationsAdminView {
  return {
    available: false,
    installation: null,
    currentVersion: null,
    versions: [],
    maintenanceEvents: [],
    entitlements: [],
    rollouts: [],
    releases: [],
    activeRollout: null,
  };
}

function isTicketSixUnavailable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || /whitelabel_(installation|release|rollout|update_attempt|recovery)/i.test(error.message ?? "");
}

function rowObject(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function queryRows(value: unknown): DbRow[] {
  if (Array.isArray(value)) return value.filter((row): row is DbRow => Boolean(row) && typeof row === "object" && !Array.isArray(row));
  const record = rowObject(value);
  for (const key of ["data", "result", "rows"]) {
    if (Array.isArray(record[key])) return queryRows(record[key]);
  }
  return [];
}

function markerNames(value: unknown): string[] {
  return queryRows(value)
    .map((row) => row.migration_name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

function requireString(row: DbRow, key: string, label: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing ${key}.`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return rowObject(value);
}

export function releaseMigrationSnapshotFromRow(row: DbRow): ReleaseMigrationSnapshot {
  const metadata = objectValue(row.safe_metadata);
  const sql = [row.migration_sql, row.sql_body, metadata.pinnedSql, metadata.sqlBody, metadata.sql]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (!sql) throw new Error("Release migration is missing its immutable pinned SQL body.");
  const digest = requireString(row, "sha256", "Release migration").toLowerCase();
  if (sha256(sql) !== digest) throw new Error(`Pinned release migration digest mismatch for ${String(row.migration_name ?? "unknown")}.`);
  const migrationName = requireString(row, "migration_name", "Release migration");
  const schemaRelease = nullableString(row.schema_release) ?? migrationSchemaRelease(migrationName);
  const ordinal = Number(row.ordinal);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) throw new Error("Release migration ordinal is invalid.");
  return { ordinal, migrationName, schemaRelease, sqlSha256: digest, sql };
}

async function loadReleaseSnapshot(admin: AdminClient, releaseId: string): Promise<ReleaseSnapshot> {
  const [releaseResult, migrationResult] = await Promise.all([
    admin.from("whitelabel_release").select("*").eq("id", releaseId).maybeSingle(),
    admin.from("whitelabel_release_migration").select("*").eq("release_id", releaseId).order("ordinal", { ascending: true }),
  ]);
  if (releaseResult.error || !releaseResult.data) throw new Error("Managed release could not be loaded.");
  if (migrationResult.error) throw new Error("Managed release migration manifest could not be loaded.");
  const release = releaseResult.data as DbRow;
  const migrations = ((migrationResult.data ?? []) as DbRow[]).map(releaseMigrationSnapshotFromRow);
  if (migrations.length === 0) throw new Error("Managed release has no pinned customer migration manifest.");
  const schemaRelease = requireString(release, "schema_release", "Managed release");
  if (migrations.at(-1)?.schemaRelease !== schemaRelease) throw new Error("Managed release schema does not match its pinned migration manifest.");
  return {
    sourceSha: requireString(release, "source_sha", "Managed release"),
    schemaRelease,
    migrations,
  };
}

async function serviceCredential(admin: AdminClient, buildId: string, serviceKind: "vercel" | "supabase"): Promise<string> {
  const { data, error } = await admin.rpc("get_whitelabel_service_credential", {
    p_build_id: buildId,
    p_service_kind: serviceKind,
  });
  if (error || typeof data !== "string" || !data) {
    throw new Error(`${serviceKind} authorization is unavailable. Re-run the provider access check.`);
  }
  return data;
}

async function loadRuntimeRefs(admin: AdminClient, buildId: string, requireRepo = true) {
  const [buildResult, servicesResult] = await Promise.all([
    admin.from("whitelabel_build").select("id, domain").eq("id", buildId).maybeSingle(),
    admin
      .from("whitelabel_service_connection")
      .select("service_kind, status, account_ref, project_ref")
      .eq("build_id", buildId)
      .in("service_kind", ["vercel", "supabase"]),
  ]);
  if (buildResult.error || !buildResult.data) throw new Error("OS build could not be loaded for managed operations.");
  if (servicesResult.error) throw new Error("Customer provider references could not be loaded.");
  const services = (servicesResult.data ?? []) as DbRow[];
  const vercel = services.find((row) => row.service_kind === "vercel");
  const supabase = services.find((row) => row.service_kind === "supabase");
  if (!vercel || !supabase || vercel.status !== "verified" || supabase.status !== "verified") {
    throw new Error("Verified customer Vercel and Supabase connections are required for managed operations.");
  }
  const domain = requireString(buildResult.data as DbRow, "domain", "OS build").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const repoId = process.env.WHITELABEL_VERCEL_GIT_REPO_ID?.trim() ?? "";
  if (requireRepo && !repoId) throw new Error("Assembly Line is missing WHITELABEL_VERCEL_GIT_REPO_ID.");
  return {
    osUrl: `https://${domain}`,
    vercelTeamId: requireString(vercel, "account_ref", "Vercel service"),
    vercelProjectRef: requireString(vercel, "project_ref", "Vercel service"),
    supabaseProjectRef: requireString(supabase, "project_ref", "Supabase service"),
    repoId,
  };
}

function toVersionRecord(row: DbRow): InstallationVersionRecord {
  const origin = row.origin_kind;
  return {
    id: requireString(row, "id", "Installation version"),
    installationId: requireString(row, "installation_id", "Installation version"),
    sourceSha: requireString(row, "source_sha", "Installation version"),
    schemaRelease: requireString(row, "schema_release", "Installation version"),
    deploymentRef: nullableString(row.deployment_ref),
    deploymentUrl: nullableString(row.deployment_url),
    origin: origin === "handoff" || origin === "update" || origin === "recovery" ? origin : "adopted",
    createdAt: nullableString(row.promoted_at) ?? nullableString(row.created_at) ?? new Date(0).toISOString(),
  };
}

function toAttemptRecord(row: DbRow, currentVersion: InstallationVersionRecord, release: ReleaseSnapshot): UpdateAttemptRecord {
  const stage = String(row.stage ?? "preflight") as UpdateStage;
  return {
    id: requireString(row, "id", "Update attempt"),
    installationId: requireString(row, "installation_id", "Update attempt"),
    releaseId: requireString(row, "release_id", "Update attempt"),
    status: String(row.status ?? "scheduled") as UpdateAttemptRecord["status"],
    stage,
    priorVersionId: requireString(row, "from_version_id", "Update attempt"),
    priorSourceSha: currentVersion.sourceSha,
    priorSchemaRelease: currentVersion.schemaRelease,
    targetSourceSha: release.sourceSha,
    targetSchemaRelease: release.schemaRelease,
    deploymentRef: nullableString(row.target_deployment_ref),
    deploymentUrl: nullableString(row.target_deployment_url),
    verificationRunId: nullableString(row.verification_run_id),
    lastError: nullableString(row.last_error),
  };
}

function verificationItems(items: OperationalVerificationItem[]) {
  return items.map((item) => ({
    checkKey: item.checkKey,
    label: item.label,
    category: item.category,
    mode: item.mode,
    sourceKind: "base",
    requiredForHandoff: item.required,
    status: item.status,
    expectedSummary: item.expectedSummary,
    actualSummary: item.actualSummary,
    evidence: item.evidence ?? {},
  }));
}

export function actualForwardSchemaRelease(args: {
  release: ReleaseSnapshot;
  priorSchemaRelease: string;
  actualMigrationNames: readonly string[];
}): string {
  const priorIndex = args.release.migrations.findIndex((migration) => migration.schemaRelease === args.priorSchemaRelease);
  if (priorIndex < 0) throw new Error("Recovery prior schema is outside the pinned release lineage.");
  const actual = new Set(args.actualMigrationNames);
  const known = new Set(args.release.migrations.map((migration) => migration.migrationName));
  const unknown = args.actualMigrationNames.filter((name) => !known.has(name) && name !== "__whitelabel_clean_customer_data_v1__");
  if (unknown.length) throw new Error(`Recovery detected unknown customer migration markers: ${unknown.join(", ")}.`);
  const missingBase = args.release.migrations.slice(0, priorIndex + 1).filter((migration) => !actual.has(migration.migrationName));
  if (missingBase.length) throw new Error(`Recovery is missing recorded baseline migration markers: ${missingBase.map((row) => row.migrationName).join(", ")}.`);
  let index = priorIndex;
  for (let next = priorIndex + 1; next < args.release.migrations.length; next += 1) {
    if (!actual.has(args.release.migrations[next].migrationName)) break;
    index = next;
  }
  const outOfOrder = args.release.migrations.slice(index + 2).filter((migration) => actual.has(migration.migrationName));
  if (outOfOrder.length) throw new Error(`Recovery detected non-contiguous customer migration markers: ${outOfOrder.map((row) => row.migrationName).join(", ")}.`);
  return args.release.migrations[index].schemaRelease;
}

export async function loadOperationsForAdmin(buildId: string): Promise<OperationsAdminView> {
  await requireAdmin(`/admin/os-builds/${buildId}/operations`);
  const admin = createServiceRoleClient();
  const installationResult = await admin.from("whitelabel_installation").select("*").eq("build_id", buildId).maybeSingle();
  if (installationResult.error) {
    if (isTicketSixUnavailable(installationResult.error)) return emptyOperationsView();
    throw new Error("Installation lifecycle could not be loaded.");
  }

  const releasesResult = await admin.from("whitelabel_release").select("*").order("created_at", { ascending: false });
  if (releasesResult.error) {
    if (isTicketSixUnavailable(releasesResult.error)) return emptyOperationsView();
    throw new Error("Managed releases could not be loaded.");
  }
  const releases = (releasesResult.data ?? []) as ReleaseRow[];
  const installation = installationResult.data as OperationsInstallationRow | null;
  if (!installation) return { ...emptyOperationsView(), available: true, releases };

  const [versionsResult, eventsResult, entitlementsResult, rolloutsResult] = await Promise.all([
    admin.from("whitelabel_installation_version").select("*").eq("installation_id", installation.id).order("ordinal", { ascending: false }),
    admin.from("whitelabel_maintenance_event").select("*").eq("installation_id", installation.id).order("recorded_at", { ascending: false }),
    admin.from("whitelabel_installation_entitlement").select("*").eq("installation_id", installation.id).order("created_at", { ascending: true }),
    admin.from("whitelabel_rollout").select("*").eq("installation_id", installation.id).order("created_at", { ascending: false }),
  ]);
  if (versionsResult.error || eventsResult.error || entitlementsResult.error || rolloutsResult.error) {
    throw new Error("Installation operations history could not be loaded.");
  }
  const versions = (versionsResult.data ?? []) as OperationsVersionRow[];
  const rawRollouts = (rolloutsResult.data ?? []) as RolloutRow[];
  const rolloutIds = rawRollouts.map((rollout) => rollout.id);
  const [attemptsResult, recoveriesResult] = rolloutIds.length
    ? await Promise.all([
        admin.from("whitelabel_update_attempt").select("*").in("rollout_id", rolloutIds).order("attempt_number", { ascending: false }),
        admin.from("whitelabel_recovery_run").select("*").eq("installation_id", installation.id).order("created_at", { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (attemptsResult.error || recoveriesResult.error) throw new Error("Update attempt / recovery history could not be loaded.");
  const attempts = (attemptsResult.data ?? []) as DbRow[];
  const recoveries = (recoveriesResult.data ?? []) as DbRow[];
  const rollouts: OperationsRolloutRow[] = rawRollouts.map((rollout) => {
    const attempt = attempts.find((row) => row.rollout_id === rollout.id) ?? null;
    const attemptId = attempt && typeof attempt.id === "string" ? attempt.id : null;
    const recovery = attemptId ? recoveries.find((row) => row.update_attempt_id === attemptId) ?? null : null;
    return {
      ...rollout,
      attempt,
      recovery,
      update_attempt_id: attemptId,
      attempt_status: attempt && typeof attempt.status === "string" ? attempt.status : null,
      attempt_stage: attempt && typeof attempt.stage === "string" ? attempt.stage : null,
      recovery_status: recovery && typeof recovery.status === "string" ? recovery.status : null,
    };
  });
  const activeRollout = rollouts.find((rollout) => (
    ACTIVE_ROLLOUT_STATUSES.includes(rollout.status as (typeof ACTIVE_ROLLOUT_STATUSES)[number])
    || rollout.attempt_status === "recovery_required"
    || ["pending", "running", "failed"].includes(rollout.recovery_status ?? "")
  )) ?? null;
  return {
    available: true,
    installation,
    currentVersion: versions.find((version) => version.id === installation.current_version_id) ?? null,
    versions,
    maintenanceEvents: (eventsResult.data ?? []) as MaintenanceEventRow[],
    entitlements: (entitlementsResult.data ?? []) as EntitlementRow[],
    rollouts,
    releases,
    activeRollout,
  };
}

export async function loadReleasesForAdmin(): Promise<ReleasesAdminView> {
  await requireAdmin("/admin/os-updates");
  const admin = createServiceRoleClient();
  const releasesResult = await admin.from("whitelabel_release").select("*").order("created_at", { ascending: false });
  if (releasesResult.error) {
    if (isTicketSixUnavailable(releasesResult.error)) return { available: false, releases: [] };
    throw new Error("Managed releases could not be loaded.");
  }
  const releases = (releasesResult.data ?? []) as ReleaseRow[];
  if (releases.length === 0) return { available: true, releases: [] };
  const ids = releases.map((release) => release.id);
  const [migrationsResult, rolloutsResult] = await Promise.all([
    admin.from("whitelabel_release_migration").select("release_id").in("release_id", ids),
    admin.from("whitelabel_rollout").select("release_id, status").in("release_id", ids),
  ]);
  if (migrationsResult.error || rolloutsResult.error) throw new Error("Release lifecycle summary could not be loaded.");
  const migrationRows = (migrationsResult.data ?? []) as Array<{ release_id: string }>;
  const rolloutRows = (rolloutsResult.data ?? []) as Array<{ release_id: string; status: string }>;
  return {
    available: true,
    releases: releases.map((release) => {
      const releaseRollouts = rolloutRows.filter((rollout) => rollout.release_id === release.id);
      const rolloutCounts = releaseRollouts.reduce<Record<string, number>>((counts, rollout) => {
        counts[rollout.status] = (counts[rollout.status] ?? 0) + 1;
        return counts;
      }, {});
      return {
        ...release,
        migration_count: migrationRows.filter((migration) => migration.release_id === release.id).length,
        rollout_total: releaseRollouts.length,
        rollout_counts: rolloutCounts,
      };
    }),
  };
}

export function createUpdateAdminPort(buildId: string, actorId: string): UpdateAdminPort {
  const admin = createServiceRoleClient();

  return {
    async loadUpdateContext(attemptId: string): Promise<UpdateExecutionContext> {
      const attemptResult = await admin.from("whitelabel_update_attempt").select("*").eq("id", attemptId).eq("build_id", buildId).maybeSingle();
      if (attemptResult.error || !attemptResult.data) throw new Error("Update attempt could not be loaded.");
      const attemptRow = attemptResult.data as DbRow;
      const installationId = requireString(attemptRow, "installation_id", "Update attempt");
      const releaseId = requireString(attemptRow, "release_id", "Update attempt");
      const priorVersionId = requireString(attemptRow, "from_version_id", "Update attempt");
      const rolloutId = requireString(attemptRow, "rollout_id", "Update attempt");
      const [installationResult, versionResult, release, releaseStateResult, rolloutResult, releaseMutationResult, refs, vercelToken, supabaseToken, entitlementResult] = await Promise.all([
        admin.from("whitelabel_installation").select("*").eq("id", installationId).eq("build_id", buildId).maybeSingle(),
        admin.from("whitelabel_installation_version").select("*").eq("id", priorVersionId).eq("build_id", buildId).eq("installation_id", installationId).maybeSingle(),
        loadReleaseSnapshot(admin, releaseId),
        admin.from("whitelabel_release").select("status").eq("id", releaseId).maybeSingle(),
        admin.from("whitelabel_rollout").select("*").eq("id", rolloutId).eq("build_id", buildId).maybeSingle(),
        admin.from("whitelabel_rollout").select("id").eq("release_id", releaseId).neq("id", rolloutId).in("status", ["running", "verifying", "recovering"]).limit(1).maybeSingle(),
        loadRuntimeRefs(admin, buildId),
        serviceCredential(admin, buildId, "vercel"),
        serviceCredential(admin, buildId, "supabase"),
        admin.from("whitelabel_rollout_entitlement").select("status").eq("rollout_id", rolloutId),
      ]);
      if (installationResult.error || !installationResult.data) throw new Error("Installation lifecycle could not be loaded for update.");
      if (versionResult.error || !versionResult.data) throw new Error("Pinned pre-update version could not be loaded.");
      if (releaseStateResult.error || !releaseStateResult.data) throw new Error("Managed release state could not be loaded.");
      if (rolloutResult.error || !rolloutResult.data) throw new Error("Update rollout could not be loaded.");
      if (releaseMutationResult.error) throw new Error("Release mutation slot could not be checked.");
      if (entitlementResult.error) throw new Error("Rollout entitlement snapshot could not be loaded.");
      const installationRow = installationResult.data as DbRow;
      const currentVersion = toVersionRecord(versionResult.data as DbRow);
      const rollout = rolloutResult.data as DbRow;
      const installation: InstallationRecord = {
        id: installationId,
        buildId,
        osUrl: refs.osUrl,
        managedMode: installationRow.operation_mode === "managed",
        vercelTeamId: refs.vercelTeamId,
        vercelProjectRef: refs.vercelProjectRef,
        supabaseProjectRef: refs.supabaseProjectRef,
        currentVersionId: nullableString(installationRow.current_version_id),
        currentSourceSha: currentVersion.sourceSha,
        currentSchemaRelease: currentVersion.schemaRelease,
      };
      const snapshots = (entitlementResult.data ?? []) as Array<{ status: string }>;
      return {
        installation,
        currentVersion,
        attempt: toAttemptRecord(attemptRow, currentVersion, release),
        release,
        releaseStatus: requireString(releaseStateResult.data as DbRow, "status", "Managed release") as UpdateExecutionContext["releaseStatus"],
        releaseMutationBlocked: Boolean(releaseMutationResult.data),
        maintenance: {
          active: installationRow.maintenance_status === "active",
          entitlementsCompatible: snapshots.every((snapshot) => snapshot.status === "verified"),
          noticeSentAt: nullableString(rollout.notification_at),
          scheduledFor: nullableString(rollout.scheduled_at),
        },
        vercelToken,
        supabaseToken,
        repoId: refs.repoId,
      };
    },

    async patchUpdateAttempt(attemptId: string, patch: UpdateAttemptPatch): Promise<void> {
      const values: Record<string, unknown> = {};
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.stage !== undefined) values.stage = patch.stage;
      if (patch.deploymentRef !== undefined) values.target_deployment_ref = patch.deploymentRef;
      if (patch.deploymentUrl !== undefined) values.target_deployment_url = patch.deploymentUrl;
      if (patch.verificationRunId !== undefined) values.verification_run_id = patch.verificationRunId;
      if (patch.lastError !== undefined) values.last_error = patch.lastError;
      if (patch.status === "running") values.started_at = new Date().toISOString();
      if (["succeeded", "recovered", "cancelled"].includes(patch.status ?? "")) values.completed_at = new Date().toISOString();
      if (Object.keys(values).length === 0) return;
      const result = await admin.from("whitelabel_update_attempt").update(values).eq("id", attemptId).eq("build_id", buildId).select("id, rollout_id, release_id").maybeSingle();
      if (result.error || !result.data) throw new Error("Update attempt state could not be saved.");
      const rolloutId = (result.data as DbRow).rollout_id;
      if (typeof rolloutId === "string" && patch.status === "running") {
        const rolloutUpdate = await admin.from("whitelabel_rollout").update({ status: "running", started_at: new Date().toISOString(), last_error: null }).eq("id", rolloutId).eq("build_id", buildId);
        if (rolloutUpdate.error) throw new Error("Rollout could not enter running state.");
        const releaseId = (result.data as DbRow).release_id;
        if (typeof releaseId === "string") {
          const releaseUpdate = await admin.from("whitelabel_release").update({ status: "running", started_at: new Date().toISOString() }).eq("id", releaseId).eq("status", "ready");
          if (releaseUpdate.error) throw new Error("Release could not enter running state.");
        }
      }
      if (typeof rolloutId === "string" && patch.status === "recovery_required") {
        const rolloutUpdate = await admin.from("whitelabel_rollout").update({ status: "failed", completed_at: new Date().toISOString(), last_error: patch.lastError ?? "Recovery required." }).eq("id", rolloutId).eq("build_id", buildId);
        if (rolloutUpdate.error) throw new Error("Rollout failure state could not be saved.");
      }
    },

    async pauseRelease(releaseId: string, reason: string): Promise<void> {
      const current = await admin.from("whitelabel_release").select("status, safe_metadata").eq("id", releaseId).maybeSingle();
      if (current.error || !current.data) throw new Error("Release could not be paused.");
      if ((current.data as DbRow).status === "withdrawn") return;
      const metadata = objectValue((current.data as DbRow).safe_metadata);
      const update = await admin.from("whitelabel_release").update({
        status: "paused",
        safe_metadata: { ...metadata, lastPauseReason: reason.slice(0, 1000), lastPausedAt: new Date().toISOString() },
      }).eq("id", releaseId);
      if (update.error) throw new Error("Release could not be paused.");
    },

    async recordMaintenanceEvent(input): Promise<void> {
      const inserted = await admin.from("whitelabel_maintenance_event").insert({
        installation_id: input.installationId,
        build_id: buildId,
        update_attempt_id: input.updateAttemptId,
        event_type: input.eventType,
        recorded_by: actorId,
        detail: input.detail ?? {},
      });
      if (inserted.error) throw new Error("Managed operation event could not be recorded.");
    },

    async startPostUpdateVerification(input): Promise<string> {
      const { data, error } = await admin.rpc("start_whitelabel_operational_verification", {
        p_build_id: buildId,
        p_installation_id: input.installationId,
        p_kind: "post_update",
        p_update_attempt_id: input.updateAttemptId,
        p_source_sha: input.sourceSha,
        p_schema_release: input.schemaRelease,
        p_deployment_url: input.deploymentUrl,
        p_started_by: actorId,
        p_items: verificationItems(input.verification.items),
      });
      if (error || typeof data !== "string") throw new Error(error?.message || "Post-update verification could not be started.");
      return data;
    },

    async isPostUpdateVerificationPassed(installationId, updateAttemptId, verificationRunId): Promise<boolean> {
      const result = await admin
        .from("whitelabel_verification_run")
        .select("id")
        .eq("id", verificationRunId)
        .eq("build_id", buildId)
        .eq("installation_id", installationId)
        .eq("update_attempt_id", updateAttemptId)
        .eq("kind", "post_update")
        .eq("status", "passed")
        .maybeSingle();
      if (result.error) throw new Error("Post-update verification state could not be checked.");
      return Boolean(result.data);
    },

    async promoteVerifiedVersion(input: VersionPromotionInput): Promise<string> {
      const attempt = await admin.from("whitelabel_update_attempt").select("installation_id").eq("id", input.attemptId).eq("build_id", buildId).maybeSingle();
      if (attempt.error || !attempt.data) throw new Error("Update attempt could not be promoted.");
      const { data, error } = await admin.rpc("promote_whitelabel_installed_version", {
        p_build_id: buildId,
        p_installation_id: (attempt.data as DbRow).installation_id,
        p_update_attempt_id: input.attemptId,
        p_actor_id: actorId,
      });
      if (error || typeof data !== "string") throw new Error(error?.message || "Verified update could not be promoted.");
      return data;
    },

    async loadRecoveryContext(recoveryRunId: string): Promise<RecoveryExecutionContext> {
      const recoveryResult = await admin.from("whitelabel_recovery_run").select("*").eq("id", recoveryRunId).eq("build_id", buildId).maybeSingle();
      if (recoveryResult.error || !recoveryResult.data) throw new Error("Recovery run could not be loaded.");
      const recoveryRow = recoveryResult.data as DbRow;
      const attemptId = requireString(recoveryRow, "update_attempt_id", "Recovery run");
      const attemptResult = await admin.from("whitelabel_update_attempt").select("*").eq("id", attemptId).eq("build_id", buildId).maybeSingle();
      if (attemptResult.error || !attemptResult.data) throw new Error("Recovery update attempt could not be loaded.");
      const attemptRow = attemptResult.data as DbRow;
      const installationId = requireString(attemptRow, "installation_id", "Update attempt");
      const priorVersionId = requireString(attemptRow, "from_version_id", "Update attempt");
      const releaseId = requireString(attemptRow, "release_id", "Update attempt");
      const [installationResult, versionResult, release, refs, vercelToken, supabaseToken] = await Promise.all([
        admin.from("whitelabel_installation").select("*").eq("id", installationId).eq("build_id", buildId).maybeSingle(),
        admin.from("whitelabel_installation_version").select("*").eq("id", priorVersionId).eq("installation_id", installationId).eq("build_id", buildId).maybeSingle(),
        loadReleaseSnapshot(admin, releaseId),
        loadRuntimeRefs(admin, buildId),
        serviceCredential(admin, buildId, "vercel"),
        serviceCredential(admin, buildId, "supabase"),
      ]);
      if (installationResult.error || !installationResult.data || versionResult.error || !versionResult.data) {
        throw new Error("Recovery installation baseline could not be loaded.");
      }
      const currentVersion = toVersionRecord(versionResult.data as DbRow);
      const markers = await runSupabaseSql({ token: supabaseToken, projectRef: refs.supabaseProjectRef, query: INSTALLATION_MIGRATION_MARKERS_SQL });
      const actualSchemaRelease = actualForwardSchemaRelease({ release, priorSchemaRelease: currentVersion.schemaRelease, actualMigrationNames: markerNames(markers) });
      const installationRow = installationResult.data as DbRow;
      const installation: InstallationRecord = {
        id: installationId,
        buildId,
        osUrl: refs.osUrl,
        managedMode: installationRow.operation_mode === "managed",
        vercelTeamId: refs.vercelTeamId,
        vercelProjectRef: refs.vercelProjectRef,
        supabaseProjectRef: refs.supabaseProjectRef,
        currentVersionId: nullableString(installationRow.current_version_id),
        currentSourceSha: currentVersion.sourceSha,
        currentSchemaRelease: currentVersion.schemaRelease,
      };
      const recovery: RecoveryRecord = {
        id: requireString(recoveryRow, "id", "Recovery run"),
        installationId,
        updateAttemptId: attemptId,
        status: String(recoveryRow.status) as RecoveryRecord["status"],
        deploymentRef: nullableString(recoveryRow.deployment_ref),
        deploymentUrl: nullableString(recoveryRow.deployment_url),
        lastError: nullableString(recoveryRow.last_error),
      };
      return {
        installation,
        attempt: toAttemptRecord(attemptRow, currentVersion, release),
        recovery,
        vercelToken,
        repoId: refs.repoId,
        actualSchemaRelease,
      };
    },

    async patchRecoveryRun(recoveryRunId, patch): Promise<void> {
      const values: Record<string, unknown> = {};
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.deploymentRef !== undefined) values.deployment_ref = patch.deploymentRef;
      if (patch.deploymentUrl !== undefined) values.deployment_url = patch.deploymentUrl;
      if (patch.lastError !== undefined) values.last_error = patch.lastError;
      if (patch.status === "running") values.started_at = new Date().toISOString();
      if (patch.status === "succeeded" || patch.status === "failed") values.completed_at = new Date().toISOString();
      const result = await admin.from("whitelabel_recovery_run").update(values).eq("id", recoveryRunId).eq("build_id", buildId);
      if (result.error) throw new Error("Recovery run state could not be saved.");
      if (patch.status === "running") {
        const recovery = await admin.from("whitelabel_recovery_run").select("update_attempt_id").eq("id", recoveryRunId).eq("build_id", buildId).maybeSingle();
        if (!recovery.error && recovery.data) {
          const attempt = await admin.from("whitelabel_update_attempt").select("rollout_id").eq("id", (recovery.data as DbRow).update_attempt_id as string).eq("build_id", buildId).maybeSingle();
          if (!attempt.error && attempt.data) await admin.from("whitelabel_rollout").update({ status: "recovering" }).eq("id", (attempt.data as DbRow).rollout_id as string).eq("build_id", buildId);
        }
      }
    },

    async recordRecoveryVersion(input: RecoveryVersionInput): Promise<string> {
      const attempt = await admin
        .from("whitelabel_update_attempt")
        .select("installation_id")
        .eq("id", input.updateAttemptId)
        .eq("build_id", buildId)
        .maybeSingle();
      if (attempt.error || !attempt.data) throw new Error("Recovery update attempt could not be resolved for version recording.");
      const { data, error } = await admin.rpc("record_whitelabel_recovery_version", {
        p_build_id: buildId,
        p_installation_id: requireString(attempt.data as DbRow, "installation_id", "Recovery update attempt"),
        p_recovery_run_id: input.recoveryRunId,
        p_actor_id: actorId,
        p_source_sha: input.sourceSha,
        p_schema_release: input.schemaRelease,
        p_deployment_ref: input.deploymentRef,
        p_deployment_url: input.deploymentUrl,
      });
      if (error || typeof data !== "string") throw new Error(error?.message || "Recovery version could not be recorded.");
      return data;
    },
  };
}

export async function createReleaseForAdmin(args: {
  releaseKey: string;
  releaseNotes: string | null;
  actorId: string;
  snapshot: ReleaseSnapshot;
}): Promise<string> {
  const admin = createServiceRoleClient();
  const releaseResult = await admin.from("whitelabel_release").insert({
    release_key: args.releaseKey,
    source_sha: args.snapshot.sourceSha,
    schema_release: args.snapshot.schemaRelease,
    status: "draft",
    release_notes: args.releaseNotes,
    safe_metadata: { migrationCount: args.snapshot.migrations.length, snapshotFormat: 1 },
    created_by: args.actorId,
  }).select("id").single();
  if (releaseResult.error || !releaseResult.data) throw new Error(releaseResult.error?.message || "Release could not be created.");
  const releaseId = (releaseResult.data as DbRow).id as string;
  const migrationResult = await admin.from("whitelabel_release_migration").insert(args.snapshot.migrations.map((migration) => ({
    release_id: releaseId,
    ordinal: migration.ordinal,
    migration_name: migration.migrationName,
    schema_release: migration.schemaRelease,
    migration_sql: migration.sql,
    sha256: migration.sqlSha256,
    required: true,
    recovery_strategy: "forward_fix",
    safe_metadata: {},
  })));
  if (migrationResult.error) {
    await admin.from("whitelabel_release").update({ status: "withdrawn", withdrawn_at: new Date().toISOString(), safe_metadata: { creationFailed: true } }).eq("id", releaseId);
    throw new Error("Release was created but its immutable migration snapshot could not be stored.");
  }
  return releaseId;
}

export async function transitionReleaseForAdmin(args: {
  releaseId: string;
  target: "ready" | "running" | "paused" | "completed" | "withdrawn";
  actorId: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const current = await admin.from("whitelabel_release").select("status, started_at, safe_metadata").eq("id", args.releaseId).maybeSingle();
  if (current.error || !current.data) throw new Error("Release not found.");
  const currentStatus = String((current.data as DbRow).status ?? "");
  if (args.target === "ready" && !["draft", "ready"].includes(currentStatus)) throw new Error("Only draft releases can be made ready.");
  if (args.target === "running" && !["paused", "running"].includes(currentStatus)) throw new Error("Only paused releases can be resumed.");
  if (args.target === "completed" && !["running", "completed"].includes(currentStatus)) throw new Error("Only running releases can be completed.");
  if (args.target === "withdrawn" && currentStatus === "completed") throw new Error("Completed release history cannot be withdrawn.");
  if (args.target === "ready") {
    const snapshot = await loadReleaseSnapshot(admin, args.releaseId);
    const previous = await admin
      .from("whitelabel_release")
      .select("schema_release")
      .neq("id", args.releaseId)
      .in("status", ["ready", "running", "paused", "completed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previous.error) throw new Error("Previous managed release could not be checked.");
    if (previous.data) {
      buildMigrationPlan({
        release: snapshot,
        installedSchemaRelease: requireString(previous.data as DbRow, "schema_release", "Previous release"),
      });
    }
  }
  if (args.target === "withdrawn") {
    const active = await admin.from("whitelabel_rollout").select("id").eq("release_id", args.releaseId).in("status", [...ACTIVE_ROLLOUT_STATUSES]).limit(1).maybeSingle();
    if (active.error) throw new Error("Release rollout state could not be checked.");
    if (active.data) throw new Error("A release with an active rollout cannot be withdrawn.");
  }
  if (args.target === "running" || args.target === "completed") {
    const unresolved = await admin.from("whitelabel_update_attempt").select("id").eq("release_id", args.releaseId).eq("status", "recovery_required").limit(1).maybeSingle();
    if (unresolved.error) throw new Error("Release recovery state could not be checked.");
    if (unresolved.data) throw new Error("Recover the failing installation before resuming or completing this release.");
  }
  if (args.target === "completed") {
    const active = await admin.from("whitelabel_rollout").select("id").eq("release_id", args.releaseId).in("status", [...ACTIVE_ROLLOUT_STATUSES]).limit(1).maybeSingle();
    if (active.error) throw new Error("Release rollout state could not be checked.");
    if (active.data) throw new Error("Every scheduled rollout must finish or be cancelled before the release can be completed.");
  }
  const metadata = objectValue((current.data as DbRow).safe_metadata);
  const now = new Date().toISOString();
  const values: Record<string, unknown> = {
    status: args.target,
    safe_metadata: { ...metadata, lastTransitionBy: args.actorId, lastTransitionAt: now },
  };
  if (args.target === "ready") values.ready_at = now;
  if (args.target === "running") values.started_at = nullableString((current.data as DbRow).started_at) ?? now;
  if (args.target === "completed") values.completed_at = now;
  if (args.target === "withdrawn") values.withdrawn_at = now;
  const updated = await admin.from("whitelabel_release").update(values).eq("id", args.releaseId);
  if (updated.error) throw new Error("Release status could not be changed.");
}

export async function bootstrapInstallationLifecycle(args: { buildId: string; handoffId: string; actorId: string }): Promise<string> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("bootstrap_whitelabel_installation_lifecycle", {
    p_build_id: args.buildId,
    p_handoff_id: args.handoffId,
    p_actor_id: args.actorId,
  });
  if (error || typeof data !== "string") throw new Error(error?.message || "Installation lifecycle could not be bootstrapped.");
  return data;
}

export async function bootstrapInstallationLifecycleForBuild(buildId: string, actorId: string): Promise<string> {
  const admin = createServiceRoleClient();
  const handoff = await admin.from("whitelabel_handoff").select("id").eq("build_id", buildId).eq("status", "delivered").maybeSingle();
  if (handoff.error || !handoff.data) throw new Error("A delivered canonical handoff is required before operations can be bootstrapped.");
  const { data, error } = await admin.rpc("bootstrap_whitelabel_installation_lifecycle", {
    p_build_id: buildId,
    p_handoff_id: (handoff.data as DbRow).id,
    p_actor_id: actorId,
  });
  if (error || typeof data !== "string") throw new Error(error?.message || "Installation lifecycle could not be bootstrapped.");
  return data;
}

export async function transitionMaintenanceForAdmin(args: {
  buildId: string;
  installationId: string;
  newStatus: MaintenanceStatus;
  actorId: string;
  reason: string | null;
}): Promise<string> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("transition_whitelabel_maintenance_status", {
    p_build_id: args.buildId,
    p_installation_id: args.installationId,
    p_new_status: args.newStatus,
    p_actor_id: args.actorId,
    p_reason: args.reason,
  });
  if (error || typeof data !== "string") throw new Error(error?.message || "Maintenance status could not be changed.");
  return data;
}

export async function enterIndependentOperation(args: { buildId: string; installationId: string; actorId: string; reason: string | null }): Promise<string> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("enter_whitelabel_independent_operation", {
    p_build_id: args.buildId,
    p_installation_id: args.installationId,
    p_actor_id: args.actorId,
    p_reason: args.reason,
  });
  if (error || typeof data !== "string") throw new Error(error?.message || "Installation could not enter independent operation.");
  return data;
}

export async function beginRejoinForAdmin(args: { buildId: string; installationId: string; actorId: string }): Promise<string> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("begin_whitelabel_rejoin", {
    p_build_id: args.buildId,
    p_installation_id: args.installationId,
    p_actor_id: args.actorId,
  });
  if (error || typeof data !== "string") throw new Error(error?.message || "Compatibility rejoin could not begin.");
  return data;
}

export async function completeRejoinForAdmin(args: { buildId: string; installationId: string; actorId: string }): Promise<string> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("complete_whitelabel_rejoin", {
    p_build_id: args.buildId,
    p_installation_id: args.installationId,
    p_actor_id: args.actorId,
  });
  if (error || typeof data !== "string") throw new Error(error?.message || "Compatibility rejoin could not complete.");
  return data;
}

export async function loadCompatibilityEvidence(buildId: string, installationId: string): Promise<CompatibilityEvidence> {
  const admin = createServiceRoleClient();
  const [installationResult, versionsResult, releasesResult, migrationsResult, handoffResult, servicesResult, refs, supabaseToken] = await Promise.all([
    admin.from("whitelabel_installation").select("*").eq("id", installationId).eq("build_id", buildId).maybeSingle(),
    admin.from("whitelabel_installation_version").select("*").eq("installation_id", installationId).eq("build_id", buildId),
    admin.from("whitelabel_release").select("source_sha, schema_release"),
    admin.from("whitelabel_release_migration").select("migration_name"),
    admin.from("whitelabel_handoff").select("vercel_project_ref, supabase_project_ref").eq("build_id", buildId).maybeSingle(),
    admin.from("whitelabel_service_connection").select("service_kind, project_ref").eq("build_id", buildId).in("service_kind", ["vercel", "supabase"]),
    loadRuntimeRefs(admin, buildId, false),
    serviceCredential(admin, buildId, "supabase"),
  ]);
  if (installationResult.error || !installationResult.data || versionsResult.error || releasesResult.error || migrationsResult.error || handoffResult.error || !handoffResult.data || servicesResult.error) {
    throw new Error("Compatibility evidence could not be loaded.");
  }
  const installation = installationResult.data as OperationsInstallationRow;
  const versions = (versionsResult.data ?? []) as OperationsVersionRow[];
  const currentVersion = versions.find((version) => version.id === installation.current_version_id);
  if (!currentVersion) throw new Error("Current installed version is missing from lifecycle history.");
  const releaseRows = (releasesResult.data ?? []) as Array<{ source_sha: string; schema_release: string }>;
  const services = (servicesResult.data ?? []) as Array<{ service_kind: string; project_ref: string | null }>;
  const handoff = handoffResult.data as { vercel_project_ref: string; supabase_project_ref: string };
  const vercel = services.find((service) => service.service_kind === "vercel")?.project_ref ?? null;
  const supabase = services.find((service) => service.service_kind === "supabase")?.project_ref ?? null;
  const markers = await runSupabaseSql({ token: supabaseToken, projectRef: refs.supabaseProjectRef, query: INSTALLATION_MIGRATION_MARKERS_SQL });
  return {
    installation,
    currentVersion,
    osUrl: refs.osUrl,
    knownSourceShas: [...new Set([...versions.map((version) => version.source_sha), ...releaseRows.map((release) => release.source_sha)])],
    knownSchemaReleases: [...new Set([...versions.map((version) => version.schema_release), ...releaseRows.map((release) => release.schema_release)])],
    knownMigrationNames: [...new Set([
      ...CLEAN_CUSTOMER_MIGRATIONS,
      ...((migrationsResult.data ?? []) as Array<{ migration_name: string }>).map((migration) => migration.migration_name),
    ])],
    actualMigrationNames: markerNames(markers),
    providerRefsMatch: vercel === handoff.vercel_project_ref && supabase === handoff.supabase_project_ref,
  };
}

export async function startOperationalVerificationForAdmin(args: {
  buildId: string;
  installationId: string;
  actorId: string;
  sourceSha: string;
  schemaRelease: string;
  deploymentUrl: string;
  verification: CompatibilityVerification;
}): Promise<string> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("start_whitelabel_operational_verification", {
    p_build_id: args.buildId,
    p_installation_id: args.installationId,
    p_kind: "compatibility",
    p_update_attempt_id: null,
    p_source_sha: args.sourceSha,
    p_schema_release: args.schemaRelease,
    p_deployment_url: args.deploymentUrl,
    p_started_by: args.actorId,
    p_items: verificationItems(args.verification.items),
  });
  if (error || typeof data !== "string") throw new Error(error?.message || "Compatibility verification could not be started.");
  return data;
}

export async function finalizeOperationalVerificationForAdmin(args: { buildId: string; runId: string; actorId: string }): Promise<"passed" | "blocked"> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("finalize_whitelabel_operational_verification", {
    p_build_id: args.buildId,
    p_run_id: args.runId,
    p_actor_id: args.actorId,
  });
  if (error || (data !== "passed" && data !== "blocked")) throw new Error(error?.message || "Operational verification could not be finalized.");
  return data;
}

export type EntitlementSyncResult = {
  activated: number;
  activeAdditions: number;
  totalAdditions: number;
};

async function syncInstallationEntitlementsWithClient(
  admin: AdminClient,
  args: { buildId: string; installationId: string; actorId: string },
): Promise<EntitlementSyncResult> {
  const { data, error } = await admin.rpc("sync_whitelabel_installation_entitlements", {
    p_build_id: args.buildId,
    p_installation_id: args.installationId,
    p_actor_id: args.actorId,
  });
  if (error) throw new Error(error.message || "Installation entitlements could not be synchronized.");
  const row = rowObject(data);
  const numberValue = (key: string): number => {
    const value = row[key];
    return typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);
  };
  return {
    activated: numberValue("activated"),
    activeAdditions: numberValue("activeAdditions"),
    totalAdditions: numberValue("totalAdditions"),
  };
}

export async function syncInstallationEntitlementsForAdmin(args: {
  buildId: string;
  installationId: string;
  actorId: string;
}): Promise<EntitlementSyncResult> {
  return syncInstallationEntitlementsWithClient(createServiceRoleClient(), args);
}
export async function scheduleUpdateForAdmin(args: {
  buildId: string;
  installationId: string;
  releaseId: string;
  scheduledAt: string;
  actorId: string;
}): Promise<ScheduledUpdate> {
  const admin = createServiceRoleClient();
  await syncInstallationEntitlementsWithClient(admin, { buildId: args.buildId, installationId: args.installationId, actorId: args.actorId });
  const [installationResult, releaseResult, entitlementsResult, activeAttemptResult] = await Promise.all([
    admin.from("whitelabel_installation").select("*").eq("id", args.installationId).eq("build_id", args.buildId).maybeSingle(),
    admin.from("whitelabel_release").select("*").eq("id", args.releaseId).maybeSingle(),
    admin.from("whitelabel_installation_entitlement").select("*").eq("installation_id", args.installationId).eq("build_id", args.buildId).in("status", ["pending_delivery", "active"]),
    admin.from("whitelabel_update_attempt").select("id, status").eq("installation_id", args.installationId).eq("build_id", args.buildId).in("status", ["scheduled", "running", "awaiting_verification", "paused", "recovery_required"]).limit(1).maybeSingle(),
  ]);
  if (installationResult.error || !installationResult.data) throw new Error("Installation lifecycle not found.");
  if (releaseResult.error || !releaseResult.data) throw new Error("Managed release not found.");
  if (entitlementsResult.error || activeAttemptResult.error) throw new Error("Installation update prerequisites could not be loaded.");
  if (activeAttemptResult.data) throw new Error("An existing update or recovery lifecycle must finish before another rollout can be scheduled.");
  const installation = installationResult.data as DbRow;
  const release = releaseResult.data as DbRow;
  if (installation.operation_mode !== "managed") throw new Error("Independent installations must pass compatibility rejoin before updates can be scheduled.");
  if (installation.maintenance_status !== "active") throw new Error("Active maintenance is required before updates can be scheduled.");
  if (release.status !== "ready" && release.status !== "running") throw new Error("Only ready or running releases can be scheduled.");
  const currentVersionId = requireString(installation, "current_version_id", "Installation lifecycle");
  const scheduled = new Date(args.scheduledAt);
  if (!Number.isFinite(scheduled.getTime())) throw new Error("Update schedule is invalid.");
  const entitlements = (entitlementsResult.data ?? []) as EntitlementRow[];
  const pending = entitlements.filter((entitlement) => entitlement.status === "pending_delivery");
  if (pending.length) throw new Error(`Pending purchased entitlements must be delivered or ended before update: ${pending.map((row) => row.name).join(", ")}.`);
  const now = new Date().toISOString();
  const currentVersion = await admin.from("whitelabel_installation_version").select("deployment_ref, schema_release").eq("id", currentVersionId).eq("build_id", args.buildId).maybeSingle();
  if (currentVersion.error || !currentVersion.data) throw new Error("Current installation version could not be pinned for recovery.");
  const rolloutResult = await admin.from("whitelabel_rollout").insert({
    installation_id: args.installationId,
    build_id: args.buildId,
    release_id: args.releaseId,
    from_version_id: currentVersionId,
    status: "notified",
    notification_at: now,
    scheduled_at: scheduled.toISOString(),
    created_by: args.actorId,
  }).select("id").single();
  if (rolloutResult.error || !rolloutResult.data) throw new Error(rolloutResult.error?.message || "Update rollout could not be scheduled.");
  const rolloutId = (rolloutResult.data as DbRow).id as string;
  if (entitlements.length) {
    const snapshots = await admin.from("whitelabel_rollout_entitlement").insert(entitlements.map((entitlement) => ({
      rollout_id: rolloutId,
      installation_id: args.installationId,
      build_id: args.buildId,
      entitlement_id: entitlement.id,
      policy: "preserve",
      status: "verified",
      evidence: { scheduledSnapshot: true, entitlementKey: entitlement.entitlement_key },
      verified_by: args.actorId,
      verified_at: now,
    })));
    if (snapshots.error) {
      await admin.from("whitelabel_rollout").update({ status: "cancelled", completed_at: now, last_error: "Entitlement snapshot failed." }).eq("id", rolloutId);
      throw new Error("Rollout entitlement preservation snapshot could not be created.");
    }
  }
  const attemptResult = await admin.from("whitelabel_update_attempt").insert({
    rollout_id: rolloutId,
    installation_id: args.installationId,
    build_id: args.buildId,
    release_id: args.releaseId,
    from_version_id: currentVersionId,
    attempt_number: 1,
    status: "scheduled",
    stage: "preflight",
    started_by: args.actorId,
  }).select("id").single();
  if (attemptResult.error || !attemptResult.data) {
    await admin.from("whitelabel_rollout").update({ status: "cancelled", completed_at: now, last_error: "Update attempt creation failed." }).eq("id", rolloutId);
    throw new Error(attemptResult.error?.message || "Update attempt could not be created.");
  }
  const attemptId = (attemptResult.data as DbRow).id as string;
  const recoveryPointResult = await admin.from("whitelabel_recovery_point").insert({
    update_attempt_id: attemptId,
    installation_id: args.installationId,
    build_id: args.buildId,
    from_version_id: currentVersionId,
    status: "ready",
    database_recovery_mode: "forward_fix",
    app_deployment_ref: nullableString((currentVersion.data as DbRow).deployment_ref),
    database_boundary_at: now,
    database_boundary_token: requireString(currentVersion.data as DbRow, "schema_release", "Current installation version"),
    safe_metadata: { recoveryMode: "forward_fix", databasePolicy: "leave-in-place" },
    created_by: args.actorId,
  }).select("id").single();
  if (recoveryPointResult.error || !recoveryPointResult.data) {
    await admin.from("whitelabel_update_attempt").update({ status: "cancelled", completed_at: now, last_error: "Recovery point preparation failed." }).eq("id", attemptId).eq("build_id", args.buildId);
    await admin.from("whitelabel_rollout").update({ status: "cancelled", completed_at: now, last_error: "Recovery point preparation failed." }).eq("id", rolloutId).eq("build_id", args.buildId);
    throw new Error("Recovery point could not be prepared for the update.");
  }
  return { rolloutId, attemptId, recoveryPointId: (recoveryPointResult.data as DbRow).id as string };
}

export async function createRecoveryRunForAdmin(args: { buildId: string; attemptId: string; actorId: string }): Promise<string> {
  const admin = createServiceRoleClient();
  const [attemptResult, pointResult, existingResult] = await Promise.all([
    admin.from("whitelabel_update_attempt").select("installation_id, status, rollout_id").eq("id", args.attemptId).eq("build_id", args.buildId).maybeSingle(),
    admin.from("whitelabel_recovery_point").select("id, installation_id, status, database_recovery_mode").eq("update_attempt_id", args.attemptId).eq("build_id", args.buildId).maybeSingle(),
    admin.from("whitelabel_recovery_run").select("id, status").eq("update_attempt_id", args.attemptId).eq("build_id", args.buildId).in("status", ["pending", "running"]).limit(1).maybeSingle(),
  ]);
  if (attemptResult.error || !attemptResult.data || pointResult.error || !pointResult.data || existingResult.error) throw new Error("Recovery prerequisites could not be loaded.");
  if (existingResult.data) return (existingResult.data as DbRow).id as string;
  if ((attemptResult.data as DbRow).status !== "recovery_required") throw new Error("Recovery can start only for an update attempt that requires recovery.");
  if ((pointResult.data as DbRow).status !== "ready") throw new Error("Recovery point is not ready.");
  if ((pointResult.data as DbRow).database_recovery_mode !== "forward_fix") throw new Error("This recovery point requires a restore/replay workflow that is not part of the standard managed path.");
  const installationId = requireString(attemptResult.data as DbRow, "installation_id", "Update attempt");
  const recovery = await admin.from("whitelabel_recovery_run").insert({
    recovery_point_id: (pointResult.data as DbRow).id,
    update_attempt_id: args.attemptId,
    installation_id: installationId,
    build_id: args.buildId,
    status: "pending",
    database_recovery_mode: (pointResult.data as DbRow).database_recovery_mode,
    newer_records_preserved: true,
    preservation_evidence: { strategy: "database-left-in-place" },
    started_by: args.actorId,
  }).select("id").single();
  if (recovery.error || !recovery.data) throw new Error(recovery.error?.message || "Recovery run could not be created.");
  const rolloutId = (attemptResult.data as DbRow).rollout_id;
  if (typeof rolloutId === "string") await admin.from("whitelabel_rollout").update({ status: "recovering", last_error: null }).eq("id", rolloutId).eq("build_id", args.buildId);
  return (recovery.data as DbRow).id as string;
}
