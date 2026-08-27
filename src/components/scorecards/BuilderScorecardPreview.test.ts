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
    performance: {
      activeWriters: { value: 43, rank: { rank: 3, population: 40 } },
      teamDials: { value: 8_500, rank: { rank: 4, population: 32 } },
      teamContacts: { value: 760, rank: { rank: 8, population: 32 } },
      teamPresentations: { value: 260, rank: { rank: 10, population: 32 } },
      teamSales: { value: 114, rank: { rank: 8, population: 32 } },
      teamAp: { value: 3_250_000, rank: { rank: 2, population: 35 } },
      teamIp: { value: 91_506_500, rank: { rank: 2, population: 76 } },
      firstLegPercent: { value: 45.17, rank: { rank: 12, population: 55 } },
      averageIpPerWriter: { value: 2_128_100, rank: { rank: 10, population: 40 } },
      recruits: { value: 12, rank: { rank: 2, population: 50 } },
    },
    previousPerformance: {
      activeWriters: 40,
      teamDials: 7_500,
      teamContacts: 700,
      teamPresentations: 220,
      teamSales: 100,
      teamAp: 2_800_000,
      teamIp: 80_000_000,
      firstLegPercent: 40,
      averageIpPerWriter: 2_000_000,
      recruits: 10,
    },
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
    expect(html).toContain("based on two areas the OS helps you track:");
    expect(html).toMatch(/aria-label="Two Builder scorecard areas"[\s\S]*?>Team Production<[\s\S]*?>Recruiting</);
    expect(html).not.toContain('aria-label="Three Builder scorecard areas"');
    expect(html).toContain("We rank your agency against other active agencies in the organization, not against producers.");
    expect(html).toContain("We then average all 10 ratings to give your agency an overall score:");
    expect(html).toContain("Bottom 20% of agencies");
    expect(html).toContain("Top 20% of agencies");
    expect(html).toContain("If you don&#x27;t like your ranking, do something about it!");
    expect(html.indexOf(">How Scorecards Work</h3>")).toBeLessThan(html.indexOf(">Team Production</h3>"));
  });

  it("shows ten agency percentile ratings and the Builder flip card", () => {
    const html = renderToStaticMarkup(
      createElement(BuilderScorecardPreview, { view }),
    );

    expect(html).toContain("Average rating: 4.5 out of 5 stars");
    expect(html).toContain("45 of 50 total stars");
    expect(html).toContain(">Team Production</h3>");
    expect(html).not.toContain(">Team Issued Premium</h3>");
    expect(html).not.toContain(">Team Productivity</h3>");
    expect(html).toContain("Total Active Writers: 5 out of 5 stars");
    expect(html).toContain("Total Team Dials: 5 out of 5 stars");
    expect(html).toContain("Total Team Contacts: 4 out of 5 stars");
    expect(html).toContain("Total Team Presentations: 4 out of 5 stars");
    expect(html).toContain("Total Team Sales: 4 out of 5 stars");
    expect(html).toContain("Total Team AP: 5 out of 5 stars");
    expect(html).toContain("Total Team IP: 5 out of 5 stars");
    expect(html).toContain("First Leg %: 4 out of 5 stars");
    expect(html).toContain("Avg IP Per Writer: 4 out of 5 stars");
    expect(html).toContain("Recruiting: 5 out of 5 stars");
    expect(html).toContain(">Your Scorecard</h3>");
    expect(html).toContain("July 2026 Builder Scorecard");
    expect(html).toContain('aria-label="Flip Ronny Bucica scorecard to the back"');
    expect(html).toContain("45 of 50 points");
    expect(html).toContain("Click To Flip");
  });

  it("renders Team Production as a three-by-three grid and compares all ten metrics with the previous period", () => {
    const html = renderToStaticMarkup(
      createElement(BuilderScorecardPreview, { view }),
    );

    expect(html).toContain("md:w-[calc(33.333%-0.5rem)]");
    expect(html.match(/class="growth-row/g)).toHaveLength(10);
    expect(html).toMatch(/Previous Period Growth[\s\S]*Total Active Writers[\s\S]*Total Team Dials[\s\S]*Total Team Contacts/);
    expect(html).toMatch(/Previous Period Growth[\s\S]*Total Team Presentations[\s\S]*Total Team Sales[\s\S]*Total Team AP/);
    expect(html).toMatch(/Previous Period Growth[\s\S]*Total Team IP[\s\S]*First Leg %[\s\S]*Avg IP Per Writer[\s\S]*Recruiting/);
  });
});
