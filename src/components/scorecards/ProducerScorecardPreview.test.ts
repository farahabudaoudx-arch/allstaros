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
        averageRating: 3.4,
        totalRating: 27,
        ratings: [
          { label: "Issued Premium", value: 5 },
          { label: "Submitted AP", value: 5 },
          { label: "Lead Spend", value: 0 },
          { label: "Dials", value: 2 },
          { label: "Contacts", value: 3 },
          { label: "Presentations", value: 4 },
          { label: "Submitted Sales", value: 4 },
          { label: "Tracking", value: 4 },
        ],
      }),
    );

    expect(html).toContain('aria-label="Flip Jackson Rapaport scorecard to the back"');
    expect(html).toContain('class="producer-baseball-card');
    expect(html).toContain('producer-baseball-card__front');
    expect(html).toContain('producer-baseball-card__back');
    expect(html).toContain("Jackson Rapaport");
    expect(html).toContain("July 2026 Producer Scorecard");
    expect(html).toContain("3.4 average");
    expect(html).toContain("27 of 40 points");
    expect(html).toContain("Issued Premium: 5 out of 5 stars");
    expect(html).toContain("Tracking: 4 out of 5 stars");
    expect(html).toContain("Click To Flip");
    expect(html).not.toContain("Click the card to see");
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
      priorLeadSpendCents: protectedFixture.expected.priorLeadSpendCents,
      currentIssuedIpCents: protectedFixture.expected.totalIssuedIpCents,
      priorIssuedIpCents: protectedFixture.expected.priorMonthIpCents,
      rank: {
        rank: protectedFixture.expected.rank,
        population: protectedFixture.expected.population,
        percentile: protectedFixture.expected.percentile,
        movement: null,
      },
      organizationRanks: protectedFixture.expected.organizationRanks,
      activityRows: protectedFixture.expected.activityRows,
      priorActivityRows: protectedFixture.expected.priorActivityRows,
      expectedWorkingDates: protectedFixture.expected.expectedWorkingDates,
    });

    const html = renderToStaticMarkup(
      createElement(ProducerScorecardPreview, { preview, overview }),
    );

    expect(html).toContain("Average rating: 3.4 out of 5 stars");
    expect(html).toContain("Issued Premium: 5 out of 5 stars");
    expect(html).toContain("Submitted AP: 5 out of 5 stars");
    expect(html).toContain("Lead Spend");
    expect(html).toContain("Dials: 2 out of 5 stars");
    expect(html).toContain("Contacts: 3 out of 5 stars");
    expect(html).toContain("Presentations: 4 out of 5 stars");
    expect(html).toContain("Submitted Sales: 4 out of 5 stars");
    expect(html).toContain("Tracking Consistency: 4 out of 5 stars");
    expect(html).not.toMatch(/#\d+ of \d+/);
    expect(html).toContain("No recorded performance");
    expect(html).not.toMatch(/appointments/i);
    expect(html.match(/aria-label="[^"]+ out of 5 stars"/g)).toHaveLength(23);
    expect(html.match(/data-export-exclude=""/g)).toHaveLength(12);
    expect(html).toContain(">How Scorecards Work</h3>");
    expect(html).not.toContain("Download How Scorecards Work");
    expect(html).toMatch(/<details open=""/);
    expect(html).toContain('aria-label="Toggle How Scorecards Work"');
    expect(html).toContain('class="scorecard-guide__chevron');
    expect(html).toMatch(/aria-label="Eight Producer scorecard areas"[\s\S]*?>IP<[\s\S]*?>Dials<[\s\S]*?>Presentations<[\s\S]*?>Lead Spend<[\s\S]*?>AP<[\s\S]*?>Contacts<[\s\S]*?>Sales<[\s\S]*?>Tracking</);
    expect(html).toContain("We then rank your performance in all 8 areas against the entire organization and average out your rankings to give you an overall score:");
    expect(html).toContain('aria-label="0 out of 5 stars"');
    expect(html).toContain("No recorded performance");
    expect(html).toContain('aria-label="1 out of 5 stars"');
    expect(html).toContain("Bottom 20% of producers");
    expect(html).toContain('aria-label="5 out of 5 stars"');
    expect(html).toContain("Top 20% of producers");
    expect(html).toContain("Numbers don&#x27;t lie. If you don&#x27;t like your ranking, do something about it.");
    expect(html).toContain(">Your Numbers</h3>");
    expect(html).toContain(">Your Tracking</h3>");
    expect(html).toContain(">Previous Month Growth</h3>");
    expect(html).not.toContain(">Your Activity</h3>");
    expect(html).not.toContain("what you submitted week by week");
    expect(html).not.toContain("average weekly IP");
    expect(html).toMatch(/aria-label="July 2026 producer numbers"[\s\S]*?>IP<[\s\S]*?>\$33,767<[\s\S]*?>Top 20% of producers<[\s\S]*?>AP<[\s\S]*?>\$30,948<[\s\S]*?>Lead Spend<[\s\S]*?>\$0<[\s\S]*?>No recorded performance<[\s\S]*?>Dials<[\s\S]*?>443<[\s\S]*?>21st–40th percentile<[\s\S]*?>Contacts<[\s\S]*?>38<[\s\S]*?>41st–60th percentile<[\s\S]*?>Presentations<[\s\S]*?>13<[\s\S]*?>61st–80th percentile<[\s\S]*?>Submitted Sales<[\s\S]*?>11</);
    expect(html).toContain('aria-label="Download Your Numbers as a 9:16 PNG"');
    expect(html).toContain('aria-label="Download Your Tracking as a 9:16 PNG"');
    expect(html).not.toContain("Download 04 Tracking Consistency");
    expect(html.match(/<details open=""/g)).toHaveLength(4);
    expect(html).toContain('aria-label="Toggle Your Numbers"');
    expect(html).toContain('aria-label="Toggle Your Tracking"');
    expect(html).toContain('aria-label="Toggle Previous Month Growth"');
    expect(html).not.toMatch(/>0[123]<\/p>/);
    expect(html).toMatch(/>Lead Spend<\/span><span[^>]*>\$0<\/span><\/p><p[^>]*><span[^>]*>Lead Spend<\/span><span[^>]*>\$0<\/span><\/p><p[^>]*>0%<\/p>/);
    expect(html.indexOf(">How Scorecards Work</h3>")).toBeLessThan(html.indexOf(">Your Numbers</h3>"));
    expect(html.indexOf(">Your Numbers</h3>")).toBeLessThan(html.indexOf(">Your Tracking</h3>"));
    expect(html.indexOf(">Your Tracking</h3>")).toBeLessThan(html.indexOf(">Previous Month Growth</h3>"));
    expect(html.indexOf(">Previous Month Growth</h3>")).toBeLessThan(html.indexOf(">Your Scorecard</h3>"));
    expect(html).toContain(">Your Scorecard</h3>");
    expect(html).toContain("justify-center text-center");
    expect(html).not.toMatch(/>05<\/p><h3[^>]*>Your Scorecard/);
    expect(html).toContain('aria-label="Download Your Scorecard as a 9:16 PNG"');
    expect(html).not.toContain("Download 05 Your Scorecard");
  });
});
