import { describe, expect, it } from "vitest";
import { scorecardReadyEmail, scorecardReadySubject, scorecardsUrl } from "./scorecard-ready";

describe("Scorecard Ready email", () => {
  it("uses the frozen month in the monthly subject", () => {
    expect(scorecardReadySubject({ kind: "monthly", start: "2026-08-01", end: "2026-08-31" }))
      .toBe("Your August Scorecard Is Ready");
  });

  it("uses the frozen quarter in the quarterly subject", () => {
    expect(scorecardReadySubject({ kind: "quarterly", start: "2026-07-01", end: "2026-09-30" }))
      .toBe("Your Q3 Scorecard Is Ready");
  });

  it("uses the frozen year in the annual subject", () => {
    expect(scorecardReadySubject({ kind: "annual", start: "2026-01-01", end: "2026-12-31" }))
      .toBe("Your 2026 Scorecard Is Ready");
  });

  it("builds the canonical Scorecards CTA from the supplied trusted app base URL", () => {
    expect(scorecardsUrl("https://preview.example.com/"))
      .toBe("https://preview.example.com/producer/scorecards");

    const mail = scorecardReadyEmail({
      period: { kind: "monthly", start: "2026-08-01", end: "2026-08-31" },
      deliveryType: "producer_email",
      appBaseUrl: "https://preview.example.com",
    });
    expect(mail.ctaUrl).toBe("https://preview.example.com/producer/scorecards");
    expect(mail.html).toContain('href="https://preview.example.com/producer/scorecards"');
    expect(mail.html).toContain("View My Scorecards");
    expect(mail.html).toContain("August 2026");
    expect(mail.text).toContain("August 2026");
  });

  it("rejects a period whose frozen end does not match its calendar period", () => {
    expect(() => scorecardReadySubject({ kind: "monthly", start: "2026-08-01", end: "2026-08-30" }))
      .toThrow("Published Scorecard period is not an exact calendar period.");
  });
});