import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "src/app/admin/scorecards/page.tsx"), "utf8");
const selector = readFileSync(join(process.cwd(), "src/components/admin/ManualScorecardSelector.tsx"), "utf8");

describe("Scorecard publishing admin UX", () => {
  it("puts the immutable correction workflow ahead of fallback publishing tools", () => {
    const correction = page.indexOf("Correct a published Scorecard");
    const fallback = page.indexOf("Fallback publishing tools");
    expect(correction).toBeGreaterThanOrEqual(0);
    expect(fallback).toBeGreaterThan(correction);
    expect(page).toContain("A correction creates the next immutable revision");
    expect(page).toContain("Authorized admins only");
  });

  it("offers only the latest finalized run-backed revision as a correction target", () => {
    expect(page).toContain('.in("lifecycle_status", ["final", "corrected"])');
    expect(page).toContain('.not("finalized_at", "is", null)');
    expect(page).toContain('.not("metric_run_id", "is", null)');
    expect(page).toContain('const key = `${snapshot.person_id}:${snapshot.card_type}:${snapshot.period_kind}:${snapshot.period_start}`;');
    expect(page).toContain("if (!latestCorrectable.has(key)) latestCorrectable.set(key, snapshot)");
    expect(page).toContain("revision {snapshot.revision}");
  });

  it("uses named closed periods instead of free-form calendar dates", () => {
    expect(page).toContain("recentClosedScorecardPeriods(today)");
    expect(page).toContain('name="periodSelection"');
    expect(page).not.toContain('name="periodEnd"');
    expect(selector).toContain("periods: ScorecardPeriod[]");
    expect(selector).toContain("Closed period");
    expect(selector).toContain('type="hidden" name="manualPeriodKind"');
    expect(selector).toContain('type="hidden" name="manualPeriodStart"');
    expect(selector).not.toContain('type="date"');
  });

  it("labels one-person generation as recovery and keeps the disclosure open after recovery navigation", () => {
    expect(page).toContain("One-person recovery");
    expect(page).toContain("Recover one missing initial Producer or Builder card");
    expect(page).toContain("Do not use this to change an already-published card");
    expect(page).toContain("Recover initial card");
    expect(selector).toContain("Check recovery eligibility");
    expect(page).toContain("const fallbackToolsOpen = Boolean(");
    expect(page).toContain("params.manualError || params.manualResult || params.snapshotId");
    expect(page).toContain("<details open={fallbackToolsOpen}");
  });
});
