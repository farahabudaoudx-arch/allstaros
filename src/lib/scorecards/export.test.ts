import { describe, expect, it } from "vitest";
import {
  PRODUCER_CARD_EXPORT_LAYOUT,
  SCORECARD_EXPORTS,
  SCORECARD_EXPORT_PIXEL_RATIO,
  scorecardExportFilename,
} from "./export";

describe("scorecard PNG exports", () => {
  it("uses exact 9:16 and 16:9 canvas dimensions", () => {
    expect(SCORECARD_EXPORTS.portrait).toMatchObject({ width: 1080, height: 1920 });
    expect(SCORECARD_EXPORTS.landscape).toMatchObject({ width: 1920, height: 1080 });
  });

  it("renders PNG downloads at double resolution for sharper text and images", () => {
    expect(SCORECARD_EXPORT_PIXEL_RATIO).toBe(2);
    expect(SCORECARD_EXPORTS.portrait.width * SCORECARD_EXPORT_PIXEL_RATIO).toBe(2160);
    expect(SCORECARD_EXPORTS.portrait.height * SCORECARD_EXPORT_PIXEL_RATIO).toBe(3840);
    expect(SCORECARD_EXPORTS.landscape.width * SCORECARD_EXPORT_PIXEL_RATIO).toBe(3840);
    expect(SCORECARD_EXPORTS.landscape.height * SCORECARD_EXPORT_PIXEL_RATIO).toBe(2160);
  });

  it("uses the approved staggered two-face layout for producer scorecard downloads", () => {
    expect(PRODUCER_CARD_EXPORT_LAYOUT.portrait).toEqual({
      front: { left: 128, top: 195, width: 563, height: 788 },
      back: { left: 400, top: 968, width: 544, height: 762 },
    });
    expect(PRODUCER_CARD_EXPORT_LAYOUT.landscape).toEqual({
      front: { left: 518, top: 54, width: 438, height: 613 },
      back: { left: 905, top: 400, width: 450, height: 630 },
    });
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
