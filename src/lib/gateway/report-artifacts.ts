import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const GATEWAY_REPORT_EVIDENCE_BUCKET = "gateway-report-evidence";
export const GATEWAY_REPORT_ARTIFACT_MAX_BYTES = 25 * 1024 * 1024;

export type GatewayReportArtifactProvider = "http" | "browser";

export type GatewayReportArtifactEvidence = {
  fileDate: string;
  rowsSeen: number;
  uniqueNpnCount: number;
  duplicateNpnValues: number;
  reportDate: string;
  gatewayReportDate: string;
  scorecardPeriodStart: string;
  scorecardPeriodEnd: string;
  gatewayWeekStart: string | null;
  gatewayWeekOrdinal: number | null;
  gatewayPeriodFinal: boolean | null;
};

export type GatewayReportArtifactRegistration = {
  artifactId: string;
  existing: boolean;
  periodType: "wtd" | "mtd" | "ytd";
  providerType: GatewayReportArtifactProvider;
  sourceSha256: string;
  sourceByteCount: number;
  contentType: string;
  storageVerified: boolean;
};

type ArtifactRegistrationRow = {
  artifact_id: string;
  existing: boolean;
  period_type: "wtd" | "mtd" | "ytd";
  provider_type: GatewayReportArtifactProvider;
  source_sha256: string;
  source_byte_count: number | string;
  content_type: string;
  storage_verified: boolean;
};

type ArtifactUploadStateRow = {
  artifact_id: string;
  staging_path: string;
  storage_path: string;
  source_sha256: string;
  source_byte_count: number | string;
  content_type: string;
  already_verified: boolean;
};

export type GatewayReportArtifactUploadTicket = {
  artifactId: string;
  storagePath: string;
  sourceByteCount: number;
  contentType: string;
  alreadyVerified: boolean;
  signedUploadUrl: string | null;
};

export type GatewayReportArtifactFailure = {
  status: 400 | 409 | 500;
  code:
    | "invalid_gateway_report_artifact"
    | "gateway_report_artifact_conflict"
    | "gateway_report_artifact_upload_missing"
    | "gateway_report_pull_stale"
    | "gateway_report_artifact_failed";
};

function firstRow<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row as T : null;
}

function safePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function storageNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number | string; statusCode?: number | string };
  return Number(candidate.status) === 404 || Number(candidate.statusCode) === 404;
}

function normalizeRegistration(row: ArtifactRegistrationRow | null): GatewayReportArtifactRegistration {
  const sourceByteCount = safePositiveInteger(row?.source_byte_count);
  if (
    !row?.artifact_id ||
    typeof row.existing !== "boolean" ||
    !["wtd", "mtd", "ytd"].includes(row.period_type) ||
    !["http", "browser"].includes(row.provider_type) ||
    !/^[0-9a-f]{64}$/.test(row.source_sha256 ?? "") ||
    sourceByteCount == null ||
    !row.content_type ||
    typeof row.storage_verified !== "boolean"
  ) {
    throw new Error("Gateway report artifact registration returned invalid state.");
  }
  return {
    artifactId: row.artifact_id,
    existing: row.existing,
    periodType: row.period_type,
    providerType: row.provider_type,
    sourceSha256: row.source_sha256,
    sourceByteCount,
    contentType: row.content_type,
    storageVerified: row.storage_verified,
  };
}

function normalizeUploadState(row: ArtifactUploadStateRow | null) {
  const sourceByteCount = safePositiveInteger(row?.source_byte_count);
  if (
    !row?.artifact_id ||
    !row.staging_path ||
    !row.storage_path ||
    !/^[0-9a-f]{64}$/.test(row.source_sha256 ?? "") ||
    sourceByteCount == null ||
    !row.content_type ||
    typeof row.already_verified !== "boolean"
  ) {
    throw new Error("Gateway report artifact upload authorization returned invalid state.");
  }
  return {
    artifactId: row.artifact_id,
    stagingPath: row.staging_path,
    storagePath: row.storage_path,
    sourceSha256: row.source_sha256,
    sourceByteCount,
    contentType: row.content_type,
    alreadyVerified: row.already_verified,
  };
}

async function loadGatewayReportArtifactUploadState(args: {
  jobId: string;
  sessionGeneration: number;
  claimToken: string;
  artifactId: string;
}) {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("authorize_gateway_report_pull_artifact_upload", {
    p_job_id: args.jobId,
    p_session_generation: args.sessionGeneration,
    p_claim_token: args.claimToken,
    p_artifact_id: args.artifactId,
  });
  if (error) {
    throw new Error(`Unable to authorize Gateway report artifact upload: ${error.message}`);
  }
  return { service, state: normalizeUploadState(firstRow<ArtifactUploadStateRow>(data)) };
}

export async function registerGatewayReportPullArtifact(args: {
  jobId: string;
  sessionGeneration: number;
  claimToken: string;
  periodType: "wtd" | "mtd" | "ytd";
  providerType: GatewayReportArtifactProvider;
  sourceSha256: string;
  sourceFileName: string;
  sourceByteCount: number;
  contentType: string;
  evidence: GatewayReportArtifactEvidence;
}): Promise<GatewayReportArtifactRegistration> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("register_gateway_report_pull_artifact", {
    p_job_id: args.jobId,
    p_session_generation: args.sessionGeneration,
    p_claim_token: args.claimToken,
    p_period_type: args.periodType,
    p_provider_type: args.providerType,
    p_source_sha256: args.sourceSha256,
    p_source_file_name: args.sourceFileName,
    p_source_byte_count: args.sourceByteCount,
    p_content_type: args.contentType,
    p_file_date: args.evidence.fileDate,
    p_rows_seen: args.evidence.rowsSeen,
    p_unique_npn_count: args.evidence.uniqueNpnCount,
    p_duplicate_npn_values: args.evidence.duplicateNpnValues,
    p_report_date: args.evidence.reportDate,
    p_gateway_report_date: args.evidence.gatewayReportDate,
    p_scorecard_period_start: args.evidence.scorecardPeriodStart,
    p_scorecard_period_end: args.evidence.scorecardPeriodEnd,
    p_gateway_week_start: args.evidence.gatewayWeekStart,
    p_gateway_week_ordinal: args.evidence.gatewayWeekOrdinal,
    p_gateway_period_final: args.evidence.gatewayPeriodFinal,
  });
  if (error) {
    throw new Error(`Unable to register Gateway report artifact: ${error.message}`);
  }
  return normalizeRegistration(firstRow<ArtifactRegistrationRow>(data));
}

export async function authorizeGatewayReportPullArtifactUpload(args: {
  jobId: string;
  sessionGeneration: number;
  claimToken: string;
  artifactId: string;
}): Promise<GatewayReportArtifactUploadTicket> {
  const { service, state } = await loadGatewayReportArtifactUploadState(args);
  if (state.alreadyVerified) {
    return {
      artifactId: state.artifactId,
      storagePath: state.storagePath,
      sourceByteCount: state.sourceByteCount,
      contentType: state.contentType,
      alreadyVerified: true,
      signedUploadUrl: null,
    };
  }

  const { data, error } = await service.storage
    .from(GATEWAY_REPORT_EVIDENCE_BUCKET)
    .createSignedUploadUrl(state.stagingPath, { upsert: true });
  if (error || !data?.signedUrl) {
    throw new Error("Unable to create Gateway report artifact upload authorization.");
  }

  return {
    artifactId: state.artifactId,
    storagePath: state.storagePath,
    sourceByteCount: state.sourceByteCount,
    contentType: state.contentType,
    alreadyVerified: false,
    signedUploadUrl: data.signedUrl,
  };
}

async function readStoredArtifact(
  storage: ReturnType<ReturnType<typeof createServiceRoleClient>["storage"]["from"]>,
  path: string,
): Promise<Buffer | null> {
  const { data, error } = await storage.download(path);
  if (error) {
    if (storageNotFound(error)) return null;
    throw new Error("Unable to read Gateway report artifact from storage.");
  }
  if (!data) return null;
  return Buffer.from(await data.arrayBuffer());
}

function verifyStoredArtifact(bytes: Buffer, expected: { sourceSha256: string; sourceByteCount: number }) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== expected.sourceByteCount || sha256 !== expected.sourceSha256) {
    throw new Error("gateway_report_pull_artifact_storage_mismatch");
  }
  return sha256;
}

export async function confirmGatewayReportPullArtifactUpload(args: {
  jobId: string;
  sessionGeneration: number;
  claimToken: string;
  artifactId: string;
}) {
  const { service, state } = await loadGatewayReportArtifactUploadState(args);
  if (state.alreadyVerified) {
    return { artifactId: state.artifactId, storagePath: state.storagePath, alreadyVerified: true };
  }

  const storage = service.storage.from(GATEWAY_REPORT_EVIDENCE_BUCKET);
  let bytes = await readStoredArtifact(storage, state.stagingPath);
  let finalAlreadyPresent = false;
  if (bytes == null) {
    bytes = await readStoredArtifact(storage, state.storagePath);
    finalAlreadyPresent = bytes != null;
  }
  if (bytes == null) {
    throw new Error("gateway_report_pull_artifact_upload_missing");
  }

  const observedSha256 = verifyStoredArtifact(bytes, state);

  if (!finalAlreadyPresent) {
    const { error: moveError } = await storage.move(state.stagingPath, state.storagePath);
    if (moveError) {
      const finalBytes = await readStoredArtifact(storage, state.storagePath);
      if (finalBytes == null) {
        throw new Error("Unable to finalize Gateway report artifact storage.");
      }
      verifyStoredArtifact(finalBytes, state);
      await storage.remove([state.stagingPath]).catch(() => undefined);
    }
  }

  const { data, error } = await service.rpc("confirm_gateway_report_pull_artifact_upload", {
    p_job_id: args.jobId,
    p_session_generation: args.sessionGeneration,
    p_claim_token: args.claimToken,
    p_artifact_id: args.artifactId,
    p_observed_sha256: observedSha256,
    p_observed_byte_count: bytes.byteLength,
  });
  if (error) {
    throw new Error(`Unable to confirm Gateway report artifact upload: ${error.message}`);
  }
  if (data !== true) {
    throw new Error("Gateway report artifact upload confirmation returned invalid state.");
  }

  return { artifactId: state.artifactId, storagePath: state.storagePath, alreadyVerified: false };
}

export function gatewayReportArtifactFailure(error: unknown): GatewayReportArtifactFailure {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("stale_gateway_report_pull_claim")) {
    return { status: 409, code: "gateway_report_pull_stale" };
  }
  if (message.includes("gateway_report_pull_artifact_upload_missing")) {
    return { status: 409, code: "gateway_report_artifact_upload_missing" };
  }
  if (
    message.includes("gateway_report_pull_artifact_conflict") ||
    message.includes("gateway_report_pull_artifact_not_found") ||
    message.includes("gateway_report_pull_artifact_storage_conflict") ||
    message.includes("gateway_report_pull_artifact_storage_mismatch")
  ) {
    return { status: 409, code: "gateway_report_artifact_conflict" };
  }
  if (message.includes("invalid_gateway_report_pull_artifact")) {
    return { status: 400, code: "invalid_gateway_report_artifact" };
  }
  return { status: 500, code: "gateway_report_artifact_failed" };
}
