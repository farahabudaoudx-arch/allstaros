import { describe, expect, it } from "vitest";
import { SCORECARD_EXPORTS, scorecardExportFilename } from "./export";

describe("scorecard PNG exports", () => {
  it("uses exact 9:16 and 16:9 canvas dimensions", () => {
    expect(SCORECARD_EXPORTS.portrait).toMatchObject({ width: 1080, height: 1920 });
    expect(SCORECARD_EXPORTS.landscape).toMatchObject({ width: 1920, height: 1080 });
  });

  it("builds a safe filename that identifies the section and ratio", () => {
    expect(scorecardExportFilename({
      cardType: "builder",
      memberName: "Alex Builder",
      periodLabel: "August 2026",
      sectionName: "01 Team Issued Premium",
    }, "portrait")).toBe(
      "alex-builder-august-2026-builder-scorecard-01-team-issued-premium-9x16.png",
    );
    expect(scorecardExportFilename({
      cardType: "producer",
      memberName: "Jordan Taylor",
      periodLabel: "Q3 2026",
      sectionName: "Your Activity",
    }, "landscape")).toBe(
      "jordan-taylor-q3-2026-producer-scorecard-your-activity-16x9.png",
    );
  });
});
