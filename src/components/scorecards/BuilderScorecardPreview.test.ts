import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BuilderScorecardPreview,
  type BuilderScorecardView,
} from "./BuilderScorecardPreview";

const view: BuilderScorecardView = {
  member: { fullName: "Ronny Bucica", photoUrl: null },
  period: { kind: "monthly", label: "July 2026", previousLabel: "June 2026" },
  metric: {
    teamIpCents: 91_506_500,
    teamRank: { rank: 2, population: 76 },
    teamRankUnavailableReason: null,
    activeWriters: 43,
    firstLegPercent: 45.17,
    averageMonthlyIpPerWriterCents: 2_128_100,
    monthCount: 1,
    growth: {
      comparison: "mom",
      priorTeamIpCents: 80_000_000,
      currentTeamIpCents: 91_506_500,
      percentage: 14.4,
    },
    recruitsAdded: 12,
    recruitingRank: { rank: 2, population: 98 },
    trend: [],
  },
};

describe("Builder Scorecard preview", () => {
  it("starts with the Builder-specific scorecard guide expanded", () => {
    const html = renderToStaticMarkup(
      createElement(BuilderScorecardPreview, { view }),
    );

    expect(html).toContain(">How Scorecards Work</h3>");
    expect(html).toMatch(/<details open=""/);
    expect(html).toContain('aria-label="Toggle How Scorecards Work"');
    expect(html).toContain('class="scorecard-guide__chevron');
    expect(html).not.toContain("Download How Scorecards Work");
    expect(html).toMatch(/aria-label="Four Builder scorecard areas"[\s\S]*?>Team IP<[\s\S]*?>Team Productivity<[\s\S]*?>Previous Period Growth<[\s\S]*?>Recruiting</);
    expect(html).toContain("ranked against other active builders in the organization—not against producers");
    expect(html.indexOf(">How Scorecards Work</h3>")).toBeLessThan(html.indexOf(">Team Issued Premium</h3>"));
  });
});
