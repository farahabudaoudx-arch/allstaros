import { describe, expect, it } from "vitest";
import { SCORECARD_EXPORTS, scorecardExportFilename } from "./export";

describe("scorecard PNG exports", () => {
  it("uses exact 9:16 and 16:9 canvas dimensions", () => {
    expect(SCORECARD_EXPORTS.portrait).toMatchObject({ width: 1080, height: 1920 });
    expect(SCORECARD_EXPORTS.landscape).toMatchObject({ width: 1920, height: 1080 });
  });

  it("builds a safe filename that identifies the section and ratio", () => {
    expect(scorecardExportFilename("01 Issued Premium", "portrait")).toBe(
      "01-issued-premium-9x16.png",
    );
    expect(scorecardExportFilename("Your Activity", "landscape")).toBe(
      "your-activity-16x9.png",
    );
  });
});
