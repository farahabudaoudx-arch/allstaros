import { describe, expect, it } from "vitest";
import { weeklyShares } from "./weekly-trend";

describe("weekly scorecard trend shares", () => {
  it("sizes every bar as its share of the monthly total", () => {
    const shares = weeklyShares([577_500, 824_400, 97_560, 1_877_220, 0]);

    expect(shares).toEqual([
      expect.closeTo(17.1, 1),
      expect.closeTo(24.4, 1),
      expect.closeTo(2.9, 1),
      expect.closeTo(55.6, 1),
      0,
    ]);
    expect(shares.reduce((total, share) => total + share, 0)).toBeCloseTo(100);
  });

  it("keeps an empty month at zero width", () => {
    expect(weeklyShares([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
