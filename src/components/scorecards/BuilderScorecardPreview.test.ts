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
  it("explains the five fixed Builder ratings and equal weighting", () => {
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
    expect(html).toContain("Builder ratings use five fixed performance bands, not organization rank or percentile.");
    expect(html).toContain("Overall rating = 20% Growth + 20% First Leg + 20% Active Directs + 20% Avg IP\/Active Writer + 20% Recruits Licensed.");
    expect(html).toContain("Lower First Leg % is better. Missing or unusable rating inputs score 0 stars.");
    expect(html).not.toContain("Bottom 20% of agencies");
    expect(html).not.toContain("Top 20% of agencies");
    expect(html).not.toContain("average all 10 ratings");
    expect(html).not.toContain("If you don&#x27;t like your ranking");
    expect(html.indexOf(">How Scorecards Work</h3>")).toBeLessThan(html.indexOf(">Team Production</h3>"));
  });

  it("scores the current Builder values through the five fixed bands", () => {
    const html = renderToStaticMarkup(
      createElement(BuilderScorecardPreview, { view }),
    );

    expect(html).toContain("Average rating: 3.4 out of 5 stars");
    expect(html).toContain("17 of 25 total stars");
    expect(html).toContain("Growth %: 3 out of 5 stars");
    expect(html).toContain("First Leg %: 1 out of 5 stars");
    expect(html).toContain("Active Directs: 5 out of 5 stars");
    expect(html).toContain("Avg IP / Active Writer: 3 out of 5 stars");
    expect(html).toContain("Recruits Licensed: 5 out of 5 stars");
    expect(html).not.toMatch(/Total Team Dials: [0-5](?:\.\d)? out of 5 stars/);
    expect(html).not.toMatch(/Total Team Contacts: [0-5](?:\.\d)? out of 5 stars/);
    expect(html).not.toMatch(/Total Team Presentations: [0-5](?:\.\d)? out of 5 stars/);
    expect(html).not.toMatch(/Total Team Sales: [0-5](?:\.\d)? out of 5 stars/);
    expect(html).not.toMatch(/Total Team AP: [0-5](?:\.\d)? out of 5 stars/);
    expect(html).not.toMatch(/Total Team IP: [0-5](?:\.\d)? out of 5 stars/);
    expect(html).toContain(">Your Scorecard</h3>");
    expect(html).toContain("July 2026 Builder Scorecard");
    expect(html).toContain('aria-label="Flip Ronny Bucica scorecard to the back"');
    expect(html).toContain("17 of 25 points");
    expect(html).toContain("Click To Flip");
  });

  it("changes only the Active Directs contribution when the corrected direct count changes", () => {
    const correctedDirectsView: BuilderScorecardView = {
      ...view,
      metric: {
        ...view.metric,
        activeWriters: 1,
        performance: {
          ...view.metric.performance,
          activeWriters: { ...view.metric.performance.activeWriters, value: 1 },
        },
      },
    };
    const html = renderToStaticMarkup(
      createElement(BuilderScorecardPreview, { view: correctedDirectsView }),
    );

    expect(html).toContain("Active Directs: 1 out of 5 stars");
    expect(html).toContain("Growth %: 3 out of 5 stars");
    expect(html).toContain("First Leg %: 1 out of 5 stars");
    expect(html).toContain("Avg IP / Active Writer: 3 out of 5 stars");
    expect(html).toContain("Recruits Licensed: 5 out of 5 stars");
    expect(html).toContain("Average rating: 2.6 out of 5 stars");
    expect(html).toContain("13 of 25 total stars");
  });

  it("changes only the Recruits Licensed contribution when the corrected licensed count changes", () => {
    const correctedLicensedView: BuilderScorecardView = {
      ...view,
      metric: {
        ...view.metric,
        recruitsAdded: 1,
        performance: {
          ...view.metric.performance,
          recruits: { ...view.metric.performance.recruits, value: 1 },
        },
      },
    };
    const html = renderToStaticMarkup(
      createElement(BuilderScorecardPreview, { view: correctedLicensedView }),
    );

    expect(html).toContain("Recruits Licensed: 1 out of 5 stars");
    expect(html).toMatch(/Recruits Licensed<\/p>[\s\S]*?>1<\/p>/);
    expect(html).toContain("Growth %: 3 out of 5 stars");
    expect(html).toContain("First Leg %: 1 out of 5 stars");
    expect(html).toContain("Active Directs: 5 out of 5 stars");
    expect(html).toContain("Avg IP / Active Writer: 3 out of 5 stars");
    expect(html).toContain("Average rating: 2.6 out of 5 stars");
    expect(html).toContain("13 of 25 total stars");
  });

  it("scales only Recruits Licensed on a quarterly Builder scorecard", () => {
    const quarterlyView: BuilderScorecardView = {
      ...view,
      period: { kind: "quarterly", label: "Q3 2026", previousLabel: "Q2 2026" },
      metric: {
        ...view.metric,
        monthCount: 3,
        growth: { ...view.metric.growth, comparison: "qoq" },
      },
    };
    const html = renderToStaticMarkup(
      createElement(BuilderScorecardPreview, { view: quarterlyView }),
    );

    expect(html).toContain("Q2 2026");
    expect(html).toContain("Q3 2026");
    expect(html).toContain("Growth %: 3 out of 5 stars");
    expect(html).toContain("First Leg %: 1 out of 5 stars");
    expect(html).toContain("Active Directs: 5 out of 5 stars");
    expect(html).toContain("Avg IP / Active Writer: 3 out of 5 stars");
    expect(html).toContain("Recruits Licensed: 4 out of 5 stars");
    expect(html).toContain("Average rating: 3.2 out of 5 stars");
    expect(html).toContain("16 of 25 total stars");
  });

  it("does not turn a zero prior-period baseline into a 5-star Growth rating", () => {
    const zeroBaselineView: BuilderScorecardView = {
      ...view,
      metric: {
        ...view.metric,
        growth: {
          ...view.metric.growth,
          priorTeamIpCents: 0,
          percentage: 100,
        },
      },
    };
    const html = renderToStaticMarkup(
      createElement(BuilderScorecardPreview, { view: zeroBaselineView }),
    );

    expect(html).toContain("Growth %: 0 out of 5 stars");
    expect(html).toContain("Average rating: 2.8 out of 5 stars");
    expect(html).toContain("14 of 25 total stars");
    expect(html).not.toContain("Growth %: 5 out of 5 stars");
  });

  it("renders missing and non-finite Builder rating inputs as zero stars without leaking invalid values", () => {
    const invalidView: BuilderScorecardView = {
      ...view,
      metric: {
        ...view.metric,
        activeWriters: Number.NaN,
        firstLegPercent: Number.NaN,
        averageMonthlyIpPerWriterCents: Number.POSITIVE_INFINITY,
        recruitsAdded: Number.NaN,
        growth: {
          ...view.metric.growth,
          priorTeamIpCents: null,
          percentage: Number.NaN,
        },
        performance: {
          ...view.metric.performance,
          activeWriters: { ...view.metric.performance.activeWriters, value: Number.NaN },
          firstLegPercent: { ...view.metric.performance.firstLegPercent, value: Number.NaN },
          averageIpPerWriter: { ...view.metric.performance.averageIpPerWriter, value: Number.POSITIVE_INFINITY },
          recruits: { ...view.metric.performance.recruits, value: Number.NaN },
        },
      },
    };
    const html = renderToStaticMarkup(
      createElement(BuilderScorecardPreview, { view: invalidView }),
    );

    expect(html).toContain("Average rating: 0 out of 5 stars");
    expect(html).toContain("0 of 25 total stars");
    expect(html).toContain("Growth %: 0 out of 5 stars");
    expect(html).toContain("First Leg %: 0 out of 5 stars");
    expect(html).toContain("Active Directs: 0 out of 5 stars");
    expect(html).toContain("Avg IP / Active Writer: 0 out of 5 stars");
    expect(html).toContain("Recruits Licensed: 0 out of 5 stars");
    expect(html).not.toContain("NaN%");
    expect(html).not.toContain("Infinity");
  });

  it("retains the existing raw Team Production and period-growth data surfaces", () => {
    const html = renderToStaticMarkup(
      createElement(BuilderScorecardPreview, { view }),
    );

    expect(html).toContain("md:w-[calc(33.333%-0.5rem)]");
    expect(html.match(/class="growth-row/g)).toHaveLength(10);
    expect(html).toMatch(/Previous Period Growth[\s\S]*Active Directs[\s\S]*Total Team Dials[\s\S]*Total Team Contacts/);
    expect(html).toMatch(/Previous Period Growth[\s\S]*Total Team Presentations[\s\S]*Total Team Sales[\s\S]*Total Team AP/);
    expect(html).toMatch(/Previous Period Growth[\s\S]*Total Team IP[\s\S]*First Leg %[\s\S]*Avg IP Per Writer[\s\S]*Recruits Licensed/);
    expect(html).toContain("Recruits Licensed");
    expect(html).not.toContain("Recruits Entered the Pipeline");
  });
});
