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
};

type ClaimedRow = {
  id: string;
  person_id: string;
  pull_kind: GatewayReportPullKind;
  business_date: string;
  session_generation: number | string;
  session_ref: string;
  attempt_count: number | string;
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
  if (!supplied || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export function gatewayReportImportErrorStatus(error: unknown): 400 | 409 {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("no longer active") || message.includes("stale_gateway_report_pull")
    ? 409
    : 400;
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
  if (sessionGeneration == null || attemptCount == null || !row.session_ref) {
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
  };
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

export async function completeGatewayReportPullJob(args: {
  jobId: string;
  sessionGeneration: number;
  summary?: Record<string, unknown>;
}): Promise<boolean> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("complete_gateway_report_pull_job", {
    p_job_id: args.jobId,
    p_session_generation: args.sessionGeneration,
    p_summary: args.summary ?? {},
  });
  if (error) throw new Error(`Unable to complete Gateway report pull: ${error.message}`);
  return data === true;
}

export async function failGatewayReportPullJob(args: {
  jobId: string;
  sessionGeneration: number;
  error?: string | null;
  needsReconnect?: boolean;
  retryable?: boolean;
}): Promise<"queued" | "failed" | "needs_reconnect" | "stale"> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("fail_gateway_report_pull_job", {
    p_job_id: args.jobId,
    p_session_generation: args.sessionGeneration,
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
