import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260914000100_gateway_report_pull_artifacts.sql"),
  "utf8",
);

function functionBody(name: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = sql.indexOf("\n$$;", start) + "\n$$;".length;
  return sql.slice(start, end);
}

describe("Gateway report pull artifact SQL boundary", () => {
  it("makes claim POST retries replay-safe with a permanent request identity ledger", () => {
    expect(sql).toContain("add column if not exists claim_request_id uuid");
    expect(sql).toContain("create table if not exists public.gateway_report_pull_claim_request");
    expect(sql).toContain("request_id uuid primary key");
    expect(sql).toContain("drop function if exists public.claim_gateway_report_pull_job(integer)");
    expect(sql).toContain("p_claim_request_id uuid");
    expect(sql).toContain("where request.request_id = p_claim_request_id");
    expect(sql).toContain("and j.claim_request_id = request.request_id");
    expect(sql).toContain("and j.claim_token = request.claim_token");
    expect(sql).toContain("and j.status = 'running'");
    expect(sql).toContain("and j.lease_expires_at > now()");
    expect(sql).toContain("claim_request_id = p_claim_request_id");
    expect(sql).toContain("insert into public.gateway_report_pull_claim_request");
    expect(sql).toContain("grant execute on function public.claim_gateway_report_pull_job(uuid, integer) to service_role");
  });

  it("contains no agency-wide sync or central source concepts", () => {
    for (const forbidden of [
      "central_gateway",
      "agency_gateway",
      "gateway_sync_run",
      "gateway_sync_artifact",
      "gateway_sync_identity_result",
      "scorecard_population_context",
      "reconciliation_summary",
    ]) {
      expect(sql).not.toContain(forbidden);
    }
    expect(sql).toContain("source_kind = 'personal_gateway'");
  });

  it("stores immutable raw evidence against the existing per-person pull job", () => {
    expect(sql).toContain("create table if not exists public.gateway_report_pull_artifact");
    expect(sql).toContain("pull_job_id uuid not null references public.gateway_report_pull_job(id) on delete restrict");
    expect(sql).toContain("person_id uuid not null references public.person(id) on delete restrict");
    expect(sql).toContain("claim_token uuid not null");
    expect(sql).toContain("unique (pull_job_id, claim_token, period_type, gateway_report_date)");
    expect(sql).not.toContain("unique (pull_job_id, claim_token, period_type, source_sha256)");
    expect(sql).toContain("provider_type text not null check (provider_type in ('http', 'browser'))");
    expect(sql).toContain("source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain("create trigger gateway_report_pull_artifact_immutable");
  });

  it("keeps the evidence bucket private and bounded to raw XLSX-sized uploads", () => {
    expect(sql).toContain("'gateway-report-evidence'");
    expect(sql).toContain("false,\n  26214400");
    expect(sql).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(sql).toContain("application/octet-stream");
  });

  it("derives person identity from the claimed job and fences every mutation to the live claim", () => {
    for (const name of [
      "register_gateway_report_pull_artifact",
      "authorize_gateway_report_pull_artifact_upload",
      "confirm_gateway_report_pull_artifact_upload",
    ]) {
      const body = functionBody(name);
      expect(body).toContain("from public.gateway_report_pull_job");
      expect(body).toContain("v_job.status <> 'running'");
      expect(body).toContain("v_job.session_generation <> p_session_generation");
      expect(body).toContain("v_job.claim_token is distinct from p_claim_token");
      expect(body).toContain("v_job.lease_expires_at <= now()");
      expect(body).toContain("c.person_id = v_job.person_id");
      expect(body).not.toContain("p_person_id");
    }
  });

  it("accepts exact registration replay and rejects conflicting evidence for the same claim snapshot", () => {
    const register = functionBody("register_gateway_report_pull_artifact");
    expect(register).toContain("where a.pull_job_id = v_job.id");
    expect(register).toContain("and a.claim_token = p_claim_token");
    expect(register).toContain("and a.period_type = p_period_type");
    expect(register).toContain("and a.gateway_report_date = p_gateway_report_date");
    expect(register).toContain("existing := true");
    expect(register).toContain("raise exception 'gateway_report_pull_artifact_conflict'");
    expect(register).toContain("v_job.person_id");
  });

  it("keeps retries and multiple first-connect snapshots as distinct immutable acquisitions", () => {
    expect(sql).toContain("unique (pull_job_id, claim_token, period_type, gateway_report_date)");
    const register = functionBody("register_gateway_report_pull_artifact");
    expect(register).not.toContain("unique (pull_job_id, period_type)");
    expect(register).toContain("v_existing.claim_token is not distinct from p_claim_token");
    expect(register).toContain("v_existing.gateway_report_date is not distinct from p_gateway_report_date");
    for (const name of [
      "authorize_gateway_report_pull_artifact_upload",
      "confirm_gateway_report_pull_artifact_upload",
    ]) {
      expect(functionBody(name)).toContain("and a.claim_token = p_claim_token");
    }
  });

  it("retains validated workbook counts, File Date, and canonical coverage metadata", () => {
    for (const column of [
      "file_date date not null",
      "rows_seen integer not null",
      "unique_npn_count integer not null",
      "duplicate_npn_values integer not null",
      "report_date date not null",
      "gateway_report_date date not null",
      "scorecard_period_start date not null",
      "scorecard_period_end date not null",
      "gateway_week_start date",
      "gateway_week_ordinal integer",
      "gateway_period_final boolean",
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("check (report_date >= file_date)");
    expect(sql).toContain("check (gateway_report_date between scorecard_period_start and scorecard_period_end)");
    expect(sql).toContain("check (gateway_report_date <= report_date)");
    expect(sql).toContain("and file_date = gateway_week_start");
    expect(sql).toContain("and (gateway_report_date - gateway_week_start) between 0 and 6");
    expect(sql).toContain("and file_date between scorecard_period_start and scorecard_period_end");
    expect(sql).not.toContain("p_report_date > p_scorecard_period_end");
    expect(sql).toContain("period_type = 'wtd'");
    expect(sql).toContain("gateway_week_ordinal between 1 and 8");
    expect(sql).toContain("period_type in ('mtd', 'ytd')");

    const register = functionBody("register_gateway_report_pull_artifact");
    expect(register).toContain("p_report_date > v_job.business_date");
    expect(register).toContain("v_job.pull_kind in ('monday', 'reconnect')");
    expect(register).toContain("p_report_date is distinct from v_job.business_date");
  });

  it("separates overwriteable staging uploads from the immutable person-scoped final path", () => {
    const authorize = functionBody("authorize_gateway_report_pull_artifact_upload");
    const confirm = functionBody("confirm_gateway_report_pull_artifact_upload");
    expect(authorize).toContain("staging/%s.xlsx");
    expect(authorize).toContain("personal_gateway/%s/%s/%s/%s/%s/%s.xlsx");
    expect(authorize).toContain("v_artifact.id");
    expect(confirm).toContain("p_observed_sha256");
    expect(confirm).toContain("p_observed_byte_count");
    expect(confirm).toContain("gateway_report_pull_artifact_storage_mismatch");
    expect(confirm).toContain("storage_verified_at = now()");
  });

  it("exposes write RPCs only to service_role", () => {
    for (const signature of [
      "register_gateway_report_pull_artifact(uuid, bigint, uuid, text, text, text, text, bigint, text, date, integer, integer, integer, date, date, date, date, date, integer, boolean)",
      "authorize_gateway_report_pull_artifact_upload(uuid, bigint, uuid, uuid)",
      "confirm_gateway_report_pull_artifact_upload(uuid, bigint, uuid, uuid, text, bigint)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
  });
});
