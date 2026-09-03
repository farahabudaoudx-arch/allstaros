import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260903000100_scorecard_correction_workflow.sql"),
  "utf8",
);
const start = sql.indexOf("create or replace function publish_manual_scorecard_correction");
const end = sql.indexOf("\n$$;", start) + "\n$$;".length;
const correction = sql.slice(start, end);

describe("Scorecard correction SQL boundary", () => {
  it("is service-role-only and independently verifies the initiating admin", () => {
    expect(correction).toContain("where id = p_initiated_by and (is_admin or is_super_admin)");
    expect(sql).toContain("revoke all on function publish_manual_scorecard_correction");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role;");
  });

  it("locks the next revision and refuses to branch correction history from stale state", () => {
    const lock = correction.indexOf("pg_advisory_xact_lock");
    const existing = correction.indexOf("if existing_snapshot_id is not null then");
    const latest = correction.indexOf("select snapshot.id into latest_snapshot_id");
    const insertRun = correction.indexOf("insert into scorecard_metric_run");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(existing).toBeGreaterThan(lock);
    expect(latest).toBeGreaterThan(existing);
    expect(insertRun).toBeGreaterThan(latest);
    expect(correction).toContain("if latest_snapshot_id is distinct from p_prior_snapshot_id then");
    expect(correction).toContain("A newer Scorecard revision already exists. Correct the latest revision.");
  });

  it("converges only exact logical retries and rejects conflicting concurrent corrections", () => {
    const existingBlock = correction.slice(
      correction.indexOf("if existing_snapshot_id is not null then"),
      correction.indexOf("-- Never branch correction history"),
    );
    expect(existingBlock).toContain("snapshot.kpi_results #- '{metricPayload,preview,generatedAt}'");
    expect(existingBlock).toContain("p_published_payload #- '{metricPayload,preview,generatedAt}'");
    expect(existingBlock).toContain("snapshot.correction_reason is not distinct from btrim(p_correction_reason)");
    expect(existingBlock).toContain("snapshot.corrected_by = p_initiated_by");
    expect(existingBlock).toContain("raise exception 'A newer Scorecard revision already exists. Correct the latest revision.'");
    expect(existingBlock.indexOf("raise exception")).toBeLessThan(existingBlock.indexOf("existing := true"));
  });

  it("rejects timestamp-only or exact no-op corrections before creating an audit run", () => {
    const guard = correction.indexOf("Correction did not change published Scorecard values.");
    const insertRun = correction.indexOf("insert into scorecard_metric_run");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(insertRun);
    expect(correction).toContain("p_published_payload #- '{metricPayload,preview,generatedAt}'");
    expect(correction).toContain("prior_snapshot.kpi_results #- '{metricPayload,preview,generatedAt}'");
  });

  it("validates JSON envelope shapes before any correction persistence", () => {
    const shape = correction.indexOf("Correction payload shape is invalid.");
    const insertRun = correction.indexOf("insert into scorecard_metric_run");
    expect(shape).toBeGreaterThanOrEqual(0);
    expect(shape).toBeLessThan(insertRun);
    expect(correction).toContain("jsonb_typeof(coalesce(p_metric_payload, 'null'::jsonb)) <> 'object'");
    expect(correction).toContain("jsonb_typeof(coalesce(p_published_payload, 'null'::jsonb)) <> 'object'");
    expect(correction).toContain("jsonb_typeof(coalesce(p_schedule_facts, 'null'::jsonb)) <> 'array'");
  });

  it("records immutable lineage in a targeted run and delegates snapshot/outbox writes", () => {
    expect(correction).toContain("prior_snapshot.metric_run_id");
    expect(correction).toContain("'manual_person'");
    expect(correction).toContain("btrim(p_correction_reason)");
    expect(correction).toContain("from publish_scorecard_run(");
    expect(correction).not.toContain("insert into scorecard_snapshot");
    expect(correction).not.toContain("insert into scorecard_delivery");
  });
});
