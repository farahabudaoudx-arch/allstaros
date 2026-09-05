import { timingSafeEqual } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { gatewayReminderBusinessDate } from "./reminders";

export type GatewayReportPullKind = "first_connect" | "monday" | "reconnect";

export type ClaimedGatewayReportPullJob = {
  id: string;
  personId: string;
  pullKind: GatewayReportPullKind;
  businessDate: string;
  sessionGeneration: number;
  sessionRef: string;
  attemptCount: number;
  claimToken: string;
  leaseExpiresAt: string;
};

type ClaimedRow = {
  id: string;
  person_id: string;
  pull_kind: GatewayReportPullKind;
  business_date: string;
  session_generation: number | string;
  session_ref: string;
  attempt_count: number | string;
  claim_token: string;
  lease_expires_at: string;
};

function safeInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function gatewayReportAgentConfigured(): boolean {
  return Boolean(process.env.GATEWAY_AGENT_REPORT_TOKEN?.trim());
}

export function gatewayReportAgentAuthorized(authorization: string | null): boolean {
  const expected = process.env.GATEWAY_AGENT_REPORT_TOKEN?.trim();
  if (!expected) return false;
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (suppliedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(expectedBytes, suppliedBytes);
}

type GatewayReportPullScheduleEnv = {
  NODE_ENV?: string;
  GATEWAY_REPORT_PULL_TEST_ACCELERATION?: string;
  GATEWAY_REPORT_PULL_TEST_INTERVAL_MS?: string;
  GATEWAY_REPORT_PULL_TEST_ANCHOR_INSTANT?: string;
  GATEWAY_REPORT_PULL_TEST_ANCHOR_BUSINESS_DATE?: string;
};

export type GatewayReportPullSchedule = {
  businessDate: string;
  accelerated: boolean;
  cycle: number | null;
  intervalMs: number | null;
};

function validIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

function addUtcDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

export function gatewayReportPullSchedule(
  now = new Date(),
  env: GatewayReportPullScheduleEnv = process.env,
): GatewayReportPullSchedule {
  if (env.GATEWAY_REPORT_PULL_TEST_ACCELERATION !== "true") {
    return {
      businessDate: gatewayReminderBusinessDate(now),
      accelerated: false,
      cycle: null,
      intervalMs: null,
    };
  }
  if (env.NODE_ENV === "production") {
    throw new Error("Gateway report pull acceleration is forbidden in production.");
  }

  const intervalMs = Number(env.GATEWAY_REPORT_PULL_TEST_INTERVAL_MS);
  const anchorInstant = new Date(env.GATEWAY_REPORT_PULL_TEST_ANCHOR_INSTANT ?? "");
  const anchorBusinessDate = env.GATEWAY_REPORT_PULL_TEST_ANCHOR_BUSINESS_DATE;
  if (!Number.isInteger(intervalMs) || intervalMs < 100 || intervalMs > 3_600_000) {
    throw new Error("Gateway report pull test interval must be an integer from 100 to 3600000 ms.");
  }
  if (Number.isNaN(anchorInstant.getTime())) {
    throw new Error("Gateway report pull test anchor instant is invalid.");
  }
  if (!validIsoDate(anchorBusinessDate)) {
    throw new Error("Gateway report pull test anchor business date is invalid.");
  }
  if (new Date(`${anchorBusinessDate}T00:00:00.000Z`).getUTCDay() !== 1) {
    throw new Error("Gateway report pull test anchor business date must be a Monday.");
  }

  const elapsedMs = now.getTime() - anchorInstant.getTime();
  if (elapsedMs < 0) {
    throw new Error("Gateway report pull test acceleration has not reached its anchor instant.");
  }
  const cycle = Math.floor(elapsedMs / intervalMs);
  return {
    businessDate: addUtcDays(anchorBusinessDate, cycle * 7),
    accelerated: true,
    cycle,
    intervalMs,
  };
}

export type GatewayReportImportFailure = {
  status: 400 | 409 | 500;
  code:
    | "invalid_gateway_report"
    | "gateway_report_pull_stale"
    | "gateway_personal_import_failed";
};

export function gatewayReportImportFailure(error: unknown): GatewayReportImportFailure {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    message.includes("no longer active") ||
    message.includes("stale_gateway_report_pull") ||
    message.includes("report pull job was not found") ||
    message.includes("report pull person was not found")
  ) {
    return { status: 409, code: "gateway_report_pull_stale" };
  }

  if (
    message.startsWith("Gateway report date is later") ||
    message.startsWith("Gateway current report date does not match") ||
    message.startsWith("Gateway report is empty") ||
    message.startsWith("Gateway report is missing required columns") ||
    message.startsWith("Could not determine Gateway report date") ||
    message.includes("gateway_wtd_coverage_required") ||
    message.includes("gateway_report_coverage_required") ||
    message.includes("gateway_scorecard_coverage") ||
    message.includes("incomplete_gateway_scorecard_coverage") ||
    message.includes("gateway_week_metadata_only_valid_for_wtd") ||
    message.includes("invalid File Date") ||
    message.includes("inconsistent File Date") ||
    /^Gateway row \d+ is missing /.test(message) ||
    message.startsWith("Invalid money value") ||
    message.startsWith("Negative money value is not allowed") ||
    message.startsWith("Invalid percent value") ||
    message.startsWith("Percent must be between 0 and 100")
  ) {
    return { status: 400, code: "invalid_gateway_report" };
  }

  return { status: 500, code: "gateway_personal_import_failed" };
}

export function gatewayReportImportErrorStatus(error: unknown): 400 | 409 | 500 {
  return gatewayReportImportFailure(error).status;
}

export async function claimGatewayReportPullJob(
  leaseSeconds = 1200,
): Promise<ClaimedGatewayReportPullJob | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("claim_gateway_report_pull_job", {
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error(`Unable to claim Gateway report pull: ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as ClaimedRow | null | undefined;
  if (!row) return null;
  const sessionGeneration = safeInteger(row.session_generation);
  const attemptCount = safeInteger(row.attempt_count);
  if (
    sessionGeneration == null || attemptCount == null || !row.session_ref ||
    !row.claim_token || !row.lease_expires_at
  ) {
    throw new Error("Gateway report pull claim returned invalid state.");
  }
  return {
    id: row.id,
    personId: row.person_id,
    pullKind: row.pull_kind,
    businessDate: row.business_date,
    sessionGeneration,
    sessionRef: row.session_ref,
    attemptCount,
    claimToken: row.claim_token,
    leaseExpiresAt: row.lease_expires_at,
  };
}

export async function renewGatewayReportPullJobLease(args: {
  jobId: string;
  sessionGeneration: number;
  claimToken: string;
  leaseSeconds?: number;
}): Promise<string | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("renew_gateway_report_pull_job_lease", {
    p_job_id: args.jobId,
    p_session_generation: args.sessionGeneration,
    p_claim_token: args.claimToken,
    p_lease_seconds: args.leaseSeconds ?? 1200,
  });
  if (error) throw new Error(`Unable to renew Gateway report pull lease: ${error.message}`);
  return typeof data === "string" && data ? data : null;
}

export async function mintGatewayMondayReportPullJobs(now = new Date()) {
  const businessDate = gatewayReminderBusinessDate(now);
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("mint_gateway_monday_report_pull_jobs", {
    p_business_date: businessDate,
  });
  if (error) throw new Error(`Unable to mint Monday Gateway pulls: ${error.message}`);
  return { businessDate, minted: Number(data ?? 0) || 0 };
}

export async function mintGatewayScheduledReportPullJobs(now = new Date()) {
  const schedule = gatewayReportPullSchedule(now);
  const mintInstant = schedule.accelerated
    ? new Date(`${schedule.businessDate}T12:00:00.000Z`)
    : now;
  const result = await mintGatewayMondayReportPullJobs(mintInstant);
  return { ...result, schedule };
}

export async function completeGatewayReportPullJob(args: {
  jobId: string;
  sessionGeneration: number;
  claimToken: string;
  summary?: Record<string, unknown>;
}): Promise<boolean> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("complete_gateway_report_pull_job", {
    p_job_id: args.jobId,
    p_session_generation: args.sessionGeneration,
    p_claim_token: args.claimToken,
    p_summary: args.summary ?? {},
  });
  if (error) throw new Error(`Unable to complete Gateway report pull: ${error.message}`);
  return data === true;
}

export async function failGatewayReportPullJob(args: {
  jobId: string;
  sessionGeneration: number;
  claimToken: string;
  error?: string | null;
  needsReconnect?: boolean;
  retryable?: boolean;
}): Promise<"queued" | "failed" | "needs_reconnect" | "stale"> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("fail_gateway_report_pull_job", {
    p_job_id: args.jobId,
    p_session_generation: args.sessionGeneration,
    p_claim_token: args.claimToken,
    p_error: args.error ?? null,
    p_needs_reconnect: args.needsReconnect === true,
    p_retryable: args.retryable === true,
  });
  if (error) throw new Error(`Unable to fail Gateway report pull: ${error.message}`);
  if (data === "queued" || data === "failed" || data === "needs_reconnect" || data === "stale") {
    return data;
  }
  throw new Error("Gateway report pull failure returned invalid state.");
}
