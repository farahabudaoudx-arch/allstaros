import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260904000600_scorecard_auto_publish.sql"),
  "utf8",
);
const latestPublisherSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260831000100_manual_scorecard_generation.sql"),
  "utf8",
);
const start = sql.indexOf("create or replace function publish_gateway_complete_scorecard_population");
const end = sql.indexOf("\n$$;", start) + "\n$$;".length;
const autoPublish = sql.slice(start, end);
const publisherStart = latestPublisherSql.indexOf("create or replace function publish_scorecard_run(");
const publisherEnd = latestPublisherSql.indexOf("\n$$;", publisherStart) + "\n$$;".length;
const effectivePublisher = latestPublisherSql.slice(publisherStart, publisherEnd);

describe("automatic Scorecard population SQL boundary", () => {
  it("allows a null initiator only for gateway-complete initial population runs", () => {
    expect(sql).toContain("alter column initiated_by drop not null");
    expect(sql).toContain("scorecard_metric_run_automated_initiator_check");
    expect(sql).toContain("initiated_by is not null");
    expect(sql).toContain("generation_scope = 'population'");
    expect(sql).toContain("revision = 1");
    expect(sql).toContain("source_manifest->>'trigger' = 'gateway_complete'");
  });

  it("derives the whole frozen roster from historical period-end role facts in Chicago", () => {
    expect(sql).toContain("create or replace function scorecard_population_context");
    expect(sql).toContain("from person_role_status_history history");
    expect(sql).toContain("at time zone 'America/Chicago'");
    expect(autoPublish).toContain("from scorecard_population_context(p_period_end) context");
    expect(autoPublish).toContain("insert into person_role_status_fact");
  });

  it("serializes period publication and refuses to merge pre-existing manual revision-one cards", () => {
    const lock = autoPublish.indexOf("pg_advisory_xact_lock");
    const existingRun = autoPublish.indexOf("from scorecard_metric_run");
    const manualConflict = autoPublish.indexOf("Revision-one Scorecard artifacts already exist outside a population run");
    const insertRun = autoPublish.indexOf("insert into scorecard_metric_run");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(existingRun).toBeGreaterThan(lock);
    expect(manualConflict).toBeGreaterThan(existingRun);
    expect(insertRun).toBeGreaterThan(manualConflict);
  });

  it("requires complete producer, builder, and snapshot counts before ready", () => {
    expect(autoPublish).toContain("supplied_producer_count <> producer_count");
    expect(autoPublish).toContain("supplied_builder_count <> builder_count");
    expect(autoPublish).toContain("supplied_snapshot_count <> expected_count");
    expect(autoPublish).toContain("insert into producer_period_metric");
    expect(autoPublish).toContain("insert into builder_period_metric");
    const metricGuard = autoPublish.indexOf("Automated validated metric rows do not match");
    const ready = autoPublish.indexOf("set status = 'ready'");
    expect(metricGuard).toBeGreaterThanOrEqual(0);
    expect(ready).toBeGreaterThan(metricGuard);
  });

  it("delegates snapshots and delivery intents to publish_scorecard_run exactly once", () => {
    const calls = autoPublish.match(/publish_scorecard_run\s*\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(autoPublish).not.toContain("insert into scorecard_snapshot");
    expect(autoPublish).not.toContain("insert into scorecard_delivery");
    expect(autoPublish).toContain("published_snapshot_count <> expected_count");
  });

  it("targets the latest effective publisher semantics with full-population checks before publication status", () => {
    expect(effectivePublisher).toContain("from scorecard_metric_run where id = p_run_id for update");
    expect(effectivePublisher).toContain("Validated row counts do not match the frozen eligible population.");
    expect(effectivePublisher).toContain("Validated metric rows do not match the frozen eligible population.");
    expect(effectivePublisher).toContain("Initial publication requires every eligible Producer and Builder artifact.");
    const persisted = effectivePublisher.indexOf("Initial publication did not persist the complete artifact population.");
    const published = effectivePublisher.indexOf("update scorecard_metric_run");
    expect(persisted).toBeGreaterThanOrEqual(0);
    expect(published).toBeGreaterThan(persisted);
  });

  it("keeps the automated RPC service-role-only", () => {
    expect(sql).toContain("revoke all on function publish_gateway_complete_scorecard_population");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role;");
  });
});
