import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = [
  "20260904000200_gateway_report_pull_jobs.sql",
  "20260904000300_gateway_report_pull_claim_fix.sql",
  "20260904000400_gateway_report_pull_queue_limits.sql",
  "20260904000500_gateway_report_pull_fencing.sql",
  "20260905000100_gateway_runner_hardening.sql",
].map((name) => readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8")).join("\n");

function functionBody(name: string) {
  const replaceStart = sql.lastIndexOf(`create or replace function public.${name}`);
  const createStart = sql.lastIndexOf(`create function public.${name}`);
  const start = Math.max(replaceStart, createStart);
  const end = sql.indexOf("\n$$;", start) + "\n$$;".length;
  return sql.slice(start, end);
}

describe("Gateway report pull SQL boundary", () => {
  it("creates a durable per-person queue with generation/date dedupe", () => {
    expect(sql).toContain("create table if not exists public.gateway_report_pull_job");
    expect(sql).toContain("pull_kind in ('first_connect', 'monday', 'reconnect')");
    expect(sql).toContain("unique (person_id, pull_kind, session_generation, business_date)");
    expect(sql).toContain("status in (\n    'queued', 'running', 'succeeded', 'failed', 'cancelled', 'needs_reconnect'");
  });

  it("atomically enqueues history only on the first connection and always uses current reports on reconnect", () => {
    const enqueue = functionBody("enqueue_gateway_report_pull_after_connect");
    const complete = functionBody("complete_gateway_connection");
    expect(enqueue).not.toContain("initial_backfill_completed_at is null then 'first_connect'");
    expect(enqueue).toContain("v_connection.first_connected_at = v_connection.connected_at");
    expect(enqueue).toContain("prior.pull_kind = 'first_connect'");
    expect(enqueue).toContain("then 'first_connect'");
    expect(enqueue).toContain("else 'reconnect'");
    expect(enqueue).toContain("for update");
    expect(complete).toContain("perform public.enqueue_gateway_report_pull_after_connect(v_request.person_id)");
  });

  it("mints Monday jobs only for active connected personal sessions", () => {
    const monday = functionBody("mint_gateway_monday_report_pull_jobs");
    expect(monday).toContain("extract(isodow from p_business_date) <> 1");
    expect(monday).toContain("c.status = 'connected'");
    expect(monday).toContain("p.status = 'active'");
    expect(monday).toContain("(p.is_producer or p.is_builder)");
    expect(monday).toContain("on conflict (person_id, pull_kind, session_generation, business_date) do nothing");
  });

  it("claims one queued job with a lease, skip-locked row fencing, and exact current session generation", () => {
    const claim = functionBody("claim_gateway_report_pull_job");
    expect(claim).toContain("for update of j skip locked");
    expect(claim).toContain("limit 1");
    expect(claim).toContain("c.session_generation = j.session_generation");
    expect(claim).toContain("lease_expires_at = now() + make_interval");
    expect(claim).toContain("attempt_count = j.attempt_count + 1");
    expect(claim).toContain("claim_token = gen_random_uuid()");
    expect(claim).toContain("j.claim_token");
    expect(claim).toContain("if v_running >= 4 then");
    expect(claim).toContain("and j.attempt_count >= 3");
    expect(claim).toContain("and j.attempt_count < 3");
    expect(claim).toContain("pg_advisory_xact_lock(2107, 7)");
    expect(claim).toContain("running.person_id = j.person_id");
    expect(sql).toContain("gateway_report_pull_job_one_running_person_idx");
  });

  it("fences personal audit dates to the exact job kind, person, and generation", () => {
    const fence = functionBody("enforce_gateway_personal_import_job_date");
    expect(fence).toContain("new.person_id is distinct from v_job.person_id");
    expect(fence).toContain("new.session_generation is distinct from v_job.session_generation");
    expect(fence).toContain("v_job.pull_kind in ('monday', 'reconnect')");
    expect(fence).toContain("new.report_date is distinct from v_job.business_date");
    expect(fence).toContain("new.report_date > v_job.business_date");
    expect(fence).toContain("new.report_date < date '2026-01-01'");
    expect(sql).toContain("create trigger gateway_personal_import_job_date");
  });

  it("commits personal imports only for the live claim and records explicit personal provenance", () => {
    const importer = functionBody("import_gateway_personal_issued_premium");
    expect(importer.match(/for update/g)?.length).toBeGreaterThanOrEqual(2);
    expect(importer).toContain("v_job.claim_token is distinct from p_claim_token");
    expect(importer).toContain("v_job.lease_expires_at <= now()");
    expect(importer).toContain("p.status = 'active'");
    expect(importer).toContain("'personal_gateway'");
    expect(importer).toContain("gateway_wtd_coverage_required");
    expect(importer).toContain("scorecard_period_start");
    expect(importer).toContain("gateway_issued_premium_import");
    expect(importer).toContain("producer_issued_premium");
  });

  it("renews only a still-live exact claim and never revives an expired lease", () => {
    const renew = functionBody("renew_gateway_report_pull_job_lease");
    expect(renew).toContain("j.claim_token = p_claim_token");
    expect(renew).toContain("j.lease_expires_at > now()");
    expect(renew).toContain("c.status = 'connected'");
  });

  it("marks only the exact dead session generation for reconnect and keeps transient retry bounded", () => {
    const fail = functionBody("fail_gateway_report_pull_job");
    expect(fail).toContain("mark_gateway_connection_needs_reconnect");
    expect(fail).toContain("p_session_generation");
    expect(fail).toContain("v_job.claim_token is distinct from p_claim_token");
    expect(fail).toContain("v_job.lease_expires_at <= now()");
    expect(fail).toContain("v_job.attempt_count < 3");
    expect(fail).toContain("available_at = now() + interval '5 minutes'");
  });

  it("requires WTD, MTD, and YTD audit evidence before completing Monday/reconnect work", () => {
    const complete = functionBody("complete_gateway_report_pull_job");
    expect(complete).toContain("v_job.pull_kind in ('monday', 'reconnect')");
    expect(complete).toContain("(values ('wtd'), ('mtd'), ('ytd'))");
    expect(complete).toContain("i.pull_job_id = v_job.id");
    expect(complete).toContain("i.status in ('imported', 'no_new_report')");
    expect(complete).toContain("gateway_current_reports_incomplete");
  });

  it("keeps privileged queue/import RPCs service-role only", () => {
    for (const signature of [
      "enqueue_gateway_report_pull_after_connect(uuid)",
      "mint_gateway_monday_report_pull_jobs(date)",
      "claim_gateway_report_pull_job(integer)",
      "renew_gateway_report_pull_job_lease(uuid, bigint, uuid, integer)",
      "complete_gateway_report_pull_job(uuid, bigint, uuid, jsonb)",
      "fail_gateway_report_pull_job(uuid, bigint, uuid, text, boolean, boolean)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
  });

  it("separates legacy agency checksum dedupe from personal audit provenance", () => {
    expect(sql).toContain("drop index if exists public.gateway_ip_import_checksum_idx");
    expect(sql).toContain("gateway_ip_import_legacy_checksum_idx");
    expect(sql).toContain("gateway_ip_import_personal_checksum_lookup_idx");
    expect(sql).toContain("source_kind in ('legacy_agency', 'personal_gateway')");
  });
});
