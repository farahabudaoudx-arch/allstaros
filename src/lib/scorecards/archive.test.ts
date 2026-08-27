import { describe, expect, it } from "vitest";
import { groupScorecardArchive, type ScorecardArchiveEntry } from "./archive";

const entries: ScorecardArchiveEntry[] = [
  { id: "builder-aug", cardType: "builder", periodKind: "monthly", periodStart: "2026-08-01", periodEnd: "2026-08-31", periodLabel: "August 2026", revision: 1, lifecycleStatus: "final", finalizedAt: "2026-09-02T12:00:00Z" },
  { id: "producer-jul", cardType: "producer", periodKind: "monthly", periodStart: "2026-07-01", periodEnd: "2026-07-31", periodLabel: "July 2026", revision: 1, lifecycleStatus: "final", finalizedAt: "2026-08-02T12:00:00Z" },
  { id: "producer-aug", cardType: "producer", periodKind: "monthly", periodStart: "2026-08-01", periodEnd: "2026-08-31", periodLabel: "August 2026", revision: 2, lifecycleStatus: "corrected", finalizedAt: "2026-09-03T12:00:00Z" },
];

describe("Scorecard archive", () => {
  it("groups separate Producer and Builder artifacts by period, newest first", () => {
    expect(groupScorecardArchive(entries)).toEqual([
      {
        key: "monthly:2026-08-01",
        label: "August 2026",
        entries: [entries[2], entries[0]],
      },
      {
        key: "monthly:2026-07-01",
        label: "July 2026",
        entries: [entries[1]],
      },
    ]);
  });
});
