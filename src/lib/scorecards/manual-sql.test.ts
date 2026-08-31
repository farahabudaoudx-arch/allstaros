import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260831000100_manual_scorecard_generation.sql"),
  "utf8",
);
const manualPublishStart = sql.indexOf("create or replace function publish_manual_scorecard");
const manualPublishEnd = sql.indexOf("\n$$;", manualPublishStart) + "\n$$;".length;
const manualPublish = sql.slice(manualPublishStart, manualPublishEnd);

describe("manual Scorecard SQL boundary", () => {
  it("separates population and manual-person run identity without weakening population uniqueness", () => {
    expect(sql).toContain("generation_scope text not null default 'population'");
    expect(sql).toContain("add constraint scorecard_metric_run_generation_scope_check check");
    expect(sql).toContain("where generation_scope = 'population'");
    expect(sql).toContain("scorecard_metric_run_manual_revision_idx");
    expect(sql).toContain("period_kind, period_start, target_person_id, target_card_type, revision");
    expect(sql).toContain("where generation_scope = 'manual_person'");
  });

  it("loads only the historical target or recursive target subtree from period-end role history", () => {
    expect(sql).toContain("create or replace function scorecard_manual_target_context");
    expect(sql).toContain("with recursive");
    expect(sql).toContain("from person_role_status_history history");
    expect(sql).toContain("and child.upline_id = parent.person_id");
    expect(sql).toContain("and not child.person_id = any(parent.path)");
    expect(sql).toContain("case when person.photo_review_status = 'approved' then person.photo_url else null end");
  });

  it("keeps Gateway and Builder support reads bounded to the historical target subtree", () => {
    expect(sql).toContain("create or replace function scorecard_manual_gateway_rows");
    expect(sql).toContain("join scorecard_manual_target_context(p_person_id, p_period_end, p_include_subtree) context");
    expect(sql).toContain("create or replace function scorecard_manual_builder_production_support");
    expect(sql).toContain("from scorecard_manual_target_context(p_builder_id, p_period_end, true) context");
  });

  it("enforces exactly one validated requested metric before a manual run can become ready", () => {
    expect(sql).toContain("create or replace function enforce_manual_scorecard_run_scope()");
    expect(sql).toContain("new.checked_count <> 1");
    expect(sql).toContain("new.passed_count <> 1");
    expect(sql).toContain("producer_rows <> 1 or builder_rows <> 0");
    expect(sql).toContain("producer_rows <> 0 or builder_rows <> 1");
  });

  it("uses a transaction-scoped advisory lock plus unique identity before creating a run", () => {
    const lock = manualPublish.indexOf("pg_advisory_xact_lock");
    const existing = manualPublish.indexOf("select snapshot.id, snapshot.metric_run_id, delivery.id");
    const insertRun = manualPublish.indexOf("insert into scorecard_metric_run");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(existing).toBeGreaterThan(lock);
    expect(insertRun).toBeGreaterThan(existing);
    expect(sql).toContain("scorecard_metric_run_manual_revision_idx");
  });

  it("independently rechecks canonical admin privilege and historical target applicability", () => {
    expect(manualPublish).toContain("where id = p_initiated_by and (is_admin or is_super_admin)");
    expect(manualPublish).toContain("scorecard_manual_target_context(p_person_id, p_period_end, false)");
    expect(manualPublish).toContain("Requested manual Scorecard is not applicable to the target at period end.");
  });

  it("returns an existing finalized revision idempotently before creating a second manual run", () => {
    expect(manualPublish).toContain("snapshot.revision = p_revision");
    expect(manualPublish).toContain("snapshot.lifecycle_status in ('final', 'corrected')");
    expect(manualPublish).toContain("existing := true");
    expect(manualPublish.indexOf("existing := true")).toBeLessThan(manualPublish.indexOf("insert into scorecard_metric_run"));
  });

  it("freezes role facts and validated metric rows, then delegates snapshot and outbox creation to the canonical publisher", () => {
    expect(manualPublish).toContain("insert into person_role_status_fact");
    expect(manualPublish).toContain("insert into producer_period_metric");
    expect(manualPublish).toContain("insert into builder_period_metric");
    expect(manualPublish).toContain("from publish_scorecard_run(");
    expect(manualPublish).not.toContain("insert into scorecard_snapshot");
    expect(manualPublish).not.toContain("insert into scorecard_delivery");
  });

  it("keeps the canonical delivery upsert unambiguous when called from the manual publisher", () => {
    expect(sql).toContain("#024 publisher ambiguity compatibility");
    expect(sql).toContain("on conflict on constraint scorecard_delivery_snapshot_id_delivery_type_key do update");
    expect(sql).not.toContain("on conflict (snapshot_id, delivery_type) do update");
  });
  it("keeps the manual RPC service-role-only", () => {
    expect(sql).toContain("revoke all on function publish_manual_scorecard");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role;");
  });
});
