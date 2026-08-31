import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260811211917_validated_scorecard_runs.sql"),
  "utf8",
);
const publish = migration.slice(migration.indexOf("create or replace function publish_scorecard_run"));

describe("Scorecard publication delivery SQL boundary", () => {
  it("publishes the frozen snapshot before creating the downstream delivery outbox row", () => {
    expect(publish.indexOf("insert into scorecard_snapshot")).toBeGreaterThanOrEqual(0);
    expect(publish.indexOf("insert into scorecard_snapshot"))
      .toBeLessThan(publish.indexOf("insert into scorecard_delivery"));
    expect(publish.indexOf("insert into scorecard_delivery"))
      .toBeLessThan(publish.indexOf("update scorecard_metric_run"));
  });

  it("records missing recipients transactionally instead of requiring email success to publish", () => {
    expect(publish).toContain("case when recipient_email is null or btrim(recipient_email) = '' then 'missing_recipient' else 'pending' end");
    expect(publish).toContain("delivery.status = 'missing_recipient'");
    expect(publish).toContain("then 'delivery_errors' else 'published' end");
  });

  it("uses one stable delivery identity per published snapshot and card type", () => {
    expect(migration).toContain("idempotency_key text not null unique");
    expect(migration).toContain("unique (snapshot_id, delivery_type)");
    expect(publish).toContain("created_snapshot_id::text || ':' || delivery_kind");
  });
});