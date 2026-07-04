import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS = new Set(["heartbeat", "run_started", "run_finished"]);
const RUN_STATUSES = new Set(["running", "success", "partial", "failed"]);
const PERIOD_STATUSES = new Set(["success", "skipped", "failed", "not_run"]);

type PeriodPayload = {
  status?: unknown;
  rows?: unknown;
  pages?: unknown;
};

type StatusPayload = {
  event?: unknown;
  agentId?: unknown;
  agentName?: unknown;
  machineId?: unknown;
  source?: unknown;
  runId?: unknown;
  status?: unknown;
  startedAt?: unknown;
  finishedAt?: unknown;
  reportDate?: unknown;
  reportLabel?: unknown;
  periods?: unknown;
  errorMessage?: unknown;
  details?: unknown;
};

function authOk(request: NextRequest): boolean {
  const token = process.env.AUTOMATION_AGENT_STATUS_TOKEN || process.env.GATEWAY_AGENT_UPLOAD_TOKEN;
  if (!token) return false;
  return request.headers.get("authorization") === `Bearer ${token}`;
}

function configured(): boolean {
  return Boolean(process.env.AUTOMATION_AGENT_STATUS_TOKEN || process.env.GATEWAY_AGENT_UPLOAD_TOKEN);
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function asNonNegativeInt(value: unknown): number | null {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPeriod(periods: unknown, key: "wtd" | "mtd" | "ytd") {
  const source = asJsonObject(periods)[key] as PeriodPayload | undefined;
  const status = typeof source?.status === "string" && PERIOD_STATUSES.has(source.status)
    ? source.status
    : "not_run";
  return {
    status,
    rows: asNonNegativeInt(source?.rows),
    pages: asNonNegativeInt(source?.pages),
  };
}

function finalAgentStatus(status: string): string {
  if (status === "running") return "running";
  return status;
}

export async function POST(request: NextRequest) {
  if (!configured()) {
    return NextResponse.json(
      { ok: false, error: "agent status token is not configured" },
      { status: 503 },
    );
  }

  if (!authOk(request)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as StatusPayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const event = asText(body.event);
  if (!EVENTS.has(event)) {
    return NextResponse.json({ ok: false, error: "bad event" }, { status: 400 });
  }

  const agentId = asText(body.agentId);
  const agentName = asText(body.agentName, agentId);
  const machineId = asText(body.machineId);
  if (!agentId || !machineId) {
    return NextResponse.json(
      { ok: false, error: "agentId and machineId are required" },
      { status: 400 },
    );
  }

  const source = asText(body.source, "rentamac");
  const now = new Date().toISOString();
  const details = asJsonObject(body.details);
  const supabase = createServiceRoleClient();

  if (event === "heartbeat") {
    const { error } = await supabase.from("automation_agent_status").upsert(
      {
        agent_id: agentId,
        agent_name: agentName,
        machine_id: machineId,
        source,
        status: "online",
        last_heartbeat_at: now,
        details,
        updated_at: now,
      },
      { onConflict: "agent_id" },
    );
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, agentId });
  }

  const status = asText(body.status, event === "run_started" ? "running" : "");
  if (!RUN_STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: "bad status" }, { status: 400 });
  }

  const startedAt = asIso(body.startedAt) ?? now;
  const finishedAt = asIso(body.finishedAt);
  const reportDate = asDate(body.reportDate);
  const reportLabel = asOptionalText(body.reportLabel);
  const errorMessage = asOptionalText(body.errorMessage);
  const wtd = readPeriod(body.periods, "wtd");
  const mtd = readPeriod(body.periods, "mtd");
  const ytd = readPeriod(body.periods, "ytd");

  let runId = asOptionalText(body.runId);

  const { error: primeStatusError } = await supabase.from("automation_agent_status").upsert(
    {
      agent_id: agentId,
      agent_name: agentName,
      machine_id: machineId,
      source,
      status: finalAgentStatus(status),
      last_heartbeat_at: now,
      details,
      updated_at: now,
    },
    { onConflict: "agent_id" },
  );

  if (primeStatusError) {
    return NextResponse.json({ ok: false, error: primeStatusError.message }, { status: 500 });
  }

  if (event === "run_started" || !runId) {
    const { data, error } = await supabase
      .from("automation_agent_runs")
      .insert({
        agent_id: agentId,
        machine_id: machineId,
        source,
        status,
        started_at: startedAt,
        report_date: reportDate,
        report_label: reportLabel,
        error_message: errorMessage,
        details,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    runId = data.id as string;
  } else {
    const { error } = await supabase
      .from("automation_agent_runs")
      .update({
        status,
        finished_at: finishedAt ?? now,
        report_date: reportDate,
        report_label: reportLabel,
        wtd_status: wtd.status,
        wtd_rows: wtd.rows,
        wtd_pages: wtd.pages,
        mtd_status: mtd.status,
        mtd_rows: mtd.rows,
        mtd_pages: mtd.pages,
        ytd_status: ytd.status,
        ytd_rows: ytd.rows,
        ytd_pages: ytd.pages,
        error_message: errorMessage,
        details,
        updated_at: now,
      })
      .eq("id", runId)
      .eq("agent_id", agentId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { error: statusError } = await supabase.from("automation_agent_status").upsert(
    {
      agent_id: agentId,
      agent_name: agentName,
      machine_id: machineId,
      source,
      status: finalAgentStatus(status),
      last_heartbeat_at: now,
      last_run_id: runId,
      last_run_status: status,
      last_run_started_at: startedAt,
      last_run_finished_at: status === "running" ? null : finishedAt ?? now,
      last_success_at: status === "success" || status === "partial" ? finishedAt ?? now : undefined,
      last_error_message: errorMessage,
      report_date: reportDate,
      report_label: reportLabel,
      details,
      updated_at: now,
    },
    { onConflict: "agent_id" },
  );

  if (statusError) {
    return NextResponse.json({ ok: false, error: statusError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, agentId, runId });
}
