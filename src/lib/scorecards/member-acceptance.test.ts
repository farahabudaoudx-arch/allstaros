import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const archivePage = read("src/app/producer/(app)/scorecards/page.tsx");
const currentPage = read("src/app/producer/(app)/scorecards/current/page.tsx");
const snapshotDetail = read("src/components/scorecards/ScorecardSnapshotDetail.tsx");
const errorPage = read("src/app/producer/(app)/scorecards/error.tsx");
const loadingPage = read("src/app/producer/(app)/scorecards/loading.tsx");
const notFoundPage = read("src/app/producer/(app)/scorecards/not-found.tsx");

describe("member Scorecard acceptance wiring", () => {
  it("offers explicit Monthly, Quarterly, and Yearly archive filters", () => {
    expect(archivePage).toContain('{ kind: "monthly", label: "Monthly" }');
    expect(archivePage).toContain('{ kind: "quarterly", label: "Quarterly" }');
    expect(archivePage).toContain('{ kind: "annual", label: "Yearly" }');
    expect(archivePage).toContain("entry.periodKind === selectedPeriod");
  });

  it("shows a separate current-month in-progress Producer card until that month is published", () => {
    expect(archivePage).toContain('href="/producer/scorecards/current"');
    expect(archivePage).toContain("In progress");
    expect(archivePage).toContain("currentProducerPublished");
    expect(archivePage).toContain('entry.cardType === "producer"');
    expect(archivePage).toContain("entry.periodStart === currentPeriod.start");
  });

  it("recomputes the current month read-time without mutating published Scorecard artifacts", () => {
    expect(currentPage).toContain("loadCurrentMonthlyProducerSource");
    expect(currentPage).toContain("loadCurrentMonthlyProducerOverview");
    expect(currentPage).toContain("createMonthlyProducerPreview");
    expect(currentPage).toContain("<ProducerScorecardPreview");
    expect(currentPage).toContain('.eq("period_start", period.start)');
    expect(currentPage).toContain("/producer/scorecards/");
    expect(currentPage).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });

  it("renders both Producer and Builder published snapshots with their frozen published score", () => {
    expect(snapshotDetail).toContain('frozenScore={published.cardType === "producer" ? published.score : undefined}');
    expect(snapshotDetail).toContain('frozenScore={published.cardType === "builder" ? published.score : undefined}');
    expect(snapshotDetail).toContain("Ratings are preserved exactly as they were published for this period.");
  });

  it("uses the supported route error reset callback for a working Try again action", () => {
    expect(errorPage).toContain("reset: () => void");
    expect(errorPage).toContain("onClick={() => reset()}");
    expect(errorPage).not.toContain("unstable_retry");
  });

  it("has period-neutral loading copy and a designed inaccessible/not-found state", () => {
    expect(loadingPage).toContain("Loading your Scorecards");
    expect(notFoundPage).toContain("Scorecard not found");
    expect(notFoundPage).toContain("outside your permitted downline");
    expect(notFoundPage).toContain('href="/producer/scorecards"');
  });
});
