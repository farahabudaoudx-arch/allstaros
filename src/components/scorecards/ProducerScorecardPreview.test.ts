import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import protectedFixture from "@/lib/scorecards/fixtures/protected-producer-july-2026.json";
import {
  createMonthlyProducerPreview,
  createProducerOverview,
} from "@/lib/scorecards/lifecycle";
import { ProducerBaseballCard } from "./ProducerBaseballCard";
import { ProducerScorecardPreview } from "./ProducerScorecardPreview";

describe("Producer baseball card", () => {
  it("renders a portrait front and the producer star ratings on its back", () => {
    const html = renderToStaticMarkup(
      createElement(ProducerBaseballCard, {
        memberName: "Jackson Rapaport",
        photoUrl: null,
        periodLabel: "July 2026",
        averageRating: 2.1,
        totalRating: 17,
        ratings: [
          { label: "Issued Premium", value: 4 },
          { label: "Submitted AP", value: 4 },
          { label: "Lead Spend", value: 0 },
          { label: "Dials", value: 1 },
          { label: "Contacts", value: 1 },
          { label: "Presentations", value: 2 },
          { label: "Submitted Sales", value: 2 },
          { label: "Tracking", value: 3 },
        ],
      }),
    );

    expect(html).toContain('aria-label="Flip Jackson Rapaport scorecard to the back"');
    expect(html).toContain("Jackson Rapaport");
    expect(html).toContain("July 2026 Producer Scorecard");
    expect(html).toContain("2.1 average");
    expect(html).toContain("17 of 40 points");
    expect(html).toContain("Issued Premium: 4 out of 5 stars");
    expect(html).toContain("Tracking: 3 out of 5 stars");
    expect(html.match(/aria-label="[^"]+ out of 5 stars"/g)).toHaveLength(8);
    expect(html).not.toMatch(/#\d+ of \d+/);
  });
});

describe("Producer Scorecard preview", () => {
  it("shows the eight-rating average and the approved activity metrics", () => {
    const preview = createMonthlyProducerPreview({
      producerId: protectedFixture.producerId,
      periodStart: protectedFixture.period.start,
      periodEnd: protectedFixture.period.end,
      periodLabel: protectedFixture.period.label,
      reportDates: protectedFixture.reports.map(({ reportDate, label }) => ({ reportDate, label })),
      producerRows: protectedFixture.reports.map(({ reportDate, personalIpCents }) => ({ reportDate, personalIpCents })),
      generatedAt: "2026-08-10T12:00:00.000Z",
    });
    const overview = createProducerOverview({
      fullName: "Jackson Rapaport",
      photoUrl: null,
      submittedApCents: protectedFixture.expected.submittedApCents,
      leadSpendCents: protectedFixture.expected.leadSpendCents,
      priorSubmittedApCents: protectedFixture.expected.priorSubmittedApCents,
      currentIssuedIpCents: protectedFixture.expected.totalIssuedIpCents,
      priorIssuedIpCents: protectedFixture.expected.priorMonthIpCents,
      rank: {
        rank: protectedFixture.expected.rank,
        population: protectedFixture.expected.population,
        percentile: protectedFixture.expected.percentile,
        movement: null,
      },
      organizationRanks: Object.fromEntries(
        Object.entries(protectedFixture.expected.organizationRanks).map(([metric, rank]) => [
          metric,
          { rank, population: protectedFixture.expected.population },
        ]),
      ) as Parameters<typeof createProducerOverview>[0]["organizationRanks"],
      activityRows: protectedFixture.expected.activityRows,
      priorActivityRows: protectedFixture.expected.priorActivityRows,
      expectedWorkingDates: protectedFixture.expected.expectedWorkingDates,
    });

    const html = renderToStaticMarkup(
      createElement(ProducerScorecardPreview, { preview, overview }),
    );

    expect(html).toContain("Average rating: 2.1 out of 5 stars");
    expect(html).toContain("Issued Premium: 4 out of 5 stars");
    expect(html).toContain("Submitted AP: 4 out of 5 stars");
    expect(html).toContain("Lead Spend");
    expect(html).toContain("Tracking Consistency: 3 out of 5 stars");
    expect(html).not.toMatch(/appointments/i);
    expect(html.match(/aria-label="[^"]+ out of 5 stars"/g)).toHaveLength(23);
    expect(html.match(/data-export-exclude=""/g)).toHaveLength(15);
    expect(html).toContain(">How Scorecards Work</h3>");
    expect(html).not.toContain("Download How Scorecards Work");
    expect(html).toMatch(/<details open=""/);
    expect(html).toContain('aria-label="Toggle How Scorecards Work"');
    expect(html).toMatch(/aria-label="Eight Producer scorecard areas"[\s\S]*?>IP<[\s\S]*?>Dials<[\s\S]*?>Presentations<[\s\S]*?>Lead Spend<[\s\S]*?>AP<[\s\S]*?>Contacts<[\s\S]*?>Sales<[\s\S]*?>Tracking</);
    expect(html).toContain("We then rank your performance in all 8 areas against the entire organization and average out your rankings to give you an overall score:");
    expect(html).toContain("0 stars</dt><dd");
    expect(html).toContain("No recorded performance");
    expect(html).toContain("1 star</dt><dd");
    expect(html).toContain("Bottom 20% of producers");
    expect(html).toContain("5 stars</dt><dd");
    expect(html).toContain("Top 20% of producers");
    expect(html).toContain("Numbers don&#x27;t lie. If you don&#x27;t like your ranking, do something about it.");
    expect(html.indexOf(">How Scorecards Work</h3>")).toBeLessThan(html.indexOf(">Issued Premium</h3>"));
    expect(html).toContain(">Your Scorecard</h3>");
  });
});
