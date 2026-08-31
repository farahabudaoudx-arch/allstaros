import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function migration(name: string) {
  return readFileSync(resolve(process.cwd(), "supabase", "migrations", name), "utf8");
}

describe("published Scorecard database guards", () => {
  it("keeps finalized snapshots immutable at the database layer", () => {
    const sql = migration("20260810000100_scorecard_foundation.sql");
    expect(sql).toContain("if old.lifecycle_status in ('final', 'corrected') then");
    expect(sql).toContain("before update or delete on scorecard_snapshot");
    expect(sql).toContain("Finalized Scorecard snapshots are immutable; create a corrected revision instead.");
  });

  it("freezes validated metric/run inputs before publication", () => {
    const sql = migration("20260811211917_validated_scorecard_runs.sql");
    expect(sql).toContain("Validated Scorecard run data is immutable; create a correction revision.");
    expect(sql).toContain("create trigger producer_period_metric_immutable");
    expect(sql).toContain("create trigger builder_period_metric_immutable");
    expect(sql).toContain("create trigger person_role_status_fact_immutable");
    expect(sql).toContain("Ready and published Scorecard run inputs are immutable.");
  });

  it("publishes atomically and idempotently without overwriting an existing snapshot", () => {
    const sql = migration("20260811211917_validated_scorecard_runs.sql");
    const publish = sql.slice(sql.indexOf("create or replace function publish_scorecard_run"));
    expect(publish).toContain("where id = p_run_id for update");
    expect(publish).toContain("Initial publication requires every eligible Producer and Builder artifact.");
    expect(publish).toContain("on conflict do nothing");
    expect(publish).toContain("Initial publication did not persist the complete artifact population.");
    expect(publish.indexOf("insert into scorecard_snapshot")).toBeLessThan(publish.indexOf("update scorecard_metric_run"));
    expect(publish).toContain("set status = case when exists");
  });

  it("requires the #018 frozen envelope while preserving validated metric provenance and frozen identity", () => {
    const sql = migration("20260829000100_freeze_published_scorecard_snapshots.sql");
    expect(sql).toContain("scorecard-published-v1");
    expect(sql).toContain("new.kpi_results->'metricPayload'");
    expect(sql).toContain("Frozen Scorecard metric payload does not match its validated metric row.");
    expect(sql).toContain("from person_role_status_fact");
    expect(sql).toContain("Frozen Scorecard member identity does not match the validated run fact.");
    expect(sql).toContain("Finalized Scorecard requires a complete frozen published payload.");
  });
});
