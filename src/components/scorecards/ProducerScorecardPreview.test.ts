import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import protectedFixture from "@/lib/scorecards/fixtures/protected-producer-july-2026.json";
import {
  createMonthlyProducerPreview,
  createProducerOverview,
} from "@/lib/scorecards/lifecycle";
import { monthlyProducerSourceFromRows } from "@/lib/scorecards/source";
import { ProducerBaseballCard } from "./ProducerBaseballCard";
import { ProducerScorecardPreview } from "./ProducerScorecardPreview";

describe("Producer baseball card", () => {
  it("renders the fixed three-metric Producer rating on its back", () => {
    const html = renderToStaticMarkup(
      createElement(ProducerBaseballCard, {
        memberName: "Jackson Rapaport",
        photoUrl: null,
        periodLabel: "July 2026",
        averageRating: 2.75,
        totalRating: null,
        ratings: [
          { label: "Personal IP", value: 4 },
          { label: "Tracking", value: 3 },
          { label: "Lead Spend", value: 0 },
        ],
      }),
    );

    expect(html).toContain('aria-label="Flip Jackson Rapaport scorecard to the back"');
    expect(html).toContain('class="producer-baseball-card');
    expect(html).toContain('producer-baseball-card__front');
    expect(html).toContain('producer-baseball-card__back');
    expect(html).toContain("Jackson Rapaport");
    expect(html).toContain("July 2026 Producer Scorecard");
    expect(html).toContain("2.75 overall");
    expect(html).not.toMatch(/of 40 points/);
    expect(html).toContain("Personal IP: 4 out of 5 stars");
    expect(html).toContain("Tracking: 3 out of 5 stars");
    expect(html).toContain("Lead Spend: 0 out of 5 stars");
    expect(html).toContain("Click To Flip");
    expect(html).not.toContain("Click the card to see");
    expect(html.match(/aria-label="[^"]+ out of 5 stars"/g)).toHaveLength(3);
    expect(html).not.toMatch(/#\d+ of \d+/);
  });
});

describe("Producer Scorecard preview", () => {
  it("shows the fixed three-metric weighted Producer rating while retaining raw operating numbers", () => {
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

    expect(html).toContain("Overall rating: 2.8 out of 5 stars");
    expect(html).toContain("2.75 weighted score");
    expect(html).toContain("Issued Premium: 4 out of 5 stars");
    expect(html).toContain("Lead Spend: 0 out of 5 stars");
    expect(html).toContain("Tracking Consistency: 3 out of 5 stars");
    expect(html).not.toMatch(/Submitted AP: [0-5](?:\.\d)? out of 5 stars/);
    expect(html).not.toMatch(/Dials: [0-5](?:\.\d)? out of 5 stars/);
    expect(html).not.toMatch(/Contacts: [0-5](?:\.\d)? out of 5 stars/);
    expect(html).not.toMatch(/Presentations: [0-5](?:\.\d)? out of 5 stars/);
    expect(html).not.toMatch(/Submitted Sales: [0-5](?:\.\d)? out of 5 stars/);
    expect(html).not.toMatch(/#\d+ of \d+/);
    expect(html).not.toMatch(/appointments/i);
    expect(html.match(/aria-label="[^"]+ out of 5 stars"/g)).toHaveLength(7);

    expect(html).toContain(">How Scorecards Work</h3>");
    expect(html).not.toContain("Download How Scorecards Work");
    expect(html).toMatch(/<details open=""/);
    expect(html).toContain('aria-label="Toggle How Scorecards Work"');
    expect(html).toContain('class="scorecard-guide__chevron');
    expect(html).toContain('aria-label="Three Producer scorecard areas"');
    expect(html).toContain("Producer ratings use three fixed monthly performance bands, not organization rank or percentile.");
    expect(html).toContain("Overall rating = 50% Personal IP + 25% Tracking + 25% Lead Spend.");
    expect(html).toContain("Tracking counts unique logged days from Monday through Saturday. Sunday logs never increase the rating.");
    expect(html).toContain("Numbers don&#x27;t lie. If you don&#x27;t like your score, do something about it.");
    expect(html).not.toContain("Bottom 20% of producers");
    expect(html).not.toContain("Top 20% of producers");
    expect(html).not.toContain("21st–40th percentile");
    expect(html).not.toContain("rank your performance in all 8 areas");
    expect(html).not.toContain("If you don&#x27;t like your ranking");

    expect(html).toContain(">Your Numbers</h3>");
    expect(html).toContain(">Your Tracking</h3>");
    expect(html).toContain(">Previous Month Growth</h3>");
    expect(html).not.toContain(">Your Activity</h3>");
    expect(html).not.toContain("what you submitted week by week");
    expect(html).not.toContain("average weekly IP");
    expect(html).toMatch(/aria-label="July 2026 producer numbers"[\s\S]*?>IP<[\s\S]*?>\$33,767<[\s\S]*?>AP<[\s\S]*?>\$30,948<[\s\S]*?>Lead Spend<[\s\S]*?>\$0<[\s\S]*?>Dials<[\s\S]*?>443<[\s\S]*?>Contacts<[\s\S]*?>38<[\s\S]*?>Presentations<[\s\S]*?>13<[\s\S]*?>Submitted Sales<[\s\S]*?>11/);
    expect(html).toContain("Mon–Sat logged days this month · Sundays are not scored");
    expect(html).toContain("Personal IP: 4 out of 5 stars");
    expect(html).toContain("Tracking: 3 out of 5 stars");
    expect(html).toContain("2.75 overall");

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


  it("renders and scores Producer Issued Paid from personal IP when Gateway team IP differs", () => {
    const source = monthlyProducerSourceFromRows({
      producerId: "producer-field-lock",
      period: { start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
      generatedAt: "2026-09-01T12:00:00.000Z",
      reportImports: [{ report_date: "2026-08-07", gateway_label: "August Week 1" }],
      rows: [{
        person_id: "producer-field-lock",
        report_date: "2026-08-07",
        gateway_label: "August Week 1",
        personal_ip_cents: 1_200_000,
        team_ip_cents: 9_900_000,
      } as never],
    });
    const preview = createMonthlyProducerPreview(source);
    const overview = createProducerOverview({
      fullName: "Field Lock Producer",
      photoUrl: null,
      submittedApCents: null,
      leadSpendCents: 0,
      currentIssuedIpCents: preview.totalIssuedIpCents,
      priorIssuedIpCents: null,
      rank: { rank: null, population: 0, percentile: 0, movement: null },
      organizationRanks: protectedFixture.expected.organizationRanks,
      activityRows: [],
      expectedWorkingDates: null,
    });

    const html = renderToStaticMarkup(
      createElement(ProducerScorecardPreview, { preview, overview }),
    );

    expect(preview.totalIssuedIpCents).toBe(1_200_000);
    expect(html).toContain("Issued Premium: 1 out of 5 stars");
    expect(html).toContain("$12,000");
    expect(html).not.toContain("$99,000");
  });


  it("renders missing tracking data as zero stars without crashing or requiring a schedule", () => {
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
      submittedApCents: null,
      leadSpendCents: 0,
      currentIssuedIpCents: protectedFixture.expected.totalIssuedIpCents,
      priorIssuedIpCents: null,
      rank: { rank: null, population: 0, percentile: 0, movement: null },
      organizationRanks: protectedFixture.expected.organizationRanks,
      activityRows: [],
      expectedWorkingDates: null,
    });

    const html = renderToStaticMarkup(
      createElement(ProducerScorecardPreview, { preview, overview }),
    );

    expect(html).toContain("Overall rating: 2 out of 5 stars");
    expect(html).toContain("2.00 weighted score");
    expect(html).toContain("Tracking Consistency: 0 out of 5 stars");
    expect(html).toContain("Mon–Sat logged days this month · Sundays are not scored");
    expect(html).not.toContain("Schedule Needed");
    expect(html).not.toContain("set a schedule to measure consistency");
  });

  it("renders Sunday-only logs as unscored tracking activity", () => {
    const preview = createMonthlyProducerPreview({
      producerId: "producer-sunday-only",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      periodLabel: "August 2026",
      reportDates: [{ reportDate: "2026-08-31", label: "August Month End" }],
      producerRows: [{ reportDate: "2026-08-31", personalIpCents: 500_000 }],
      generatedAt: "2026-08-31T12:00:00.000Z",
    });
    const overview = createProducerOverview({
      fullName: "Sunday Tester",
      photoUrl: null,
      submittedApCents: null,
      leadSpendCents: 200_000,
      currentIssuedIpCents: 500_000,
      priorIssuedIpCents: null,
      rank: { rank: null, population: 0, percentile: 0, movement: null },
      organizationRanks: protectedFixture.expected.organizationRanks,
      activityRows: [
        { entryDate: "2026-08-02", leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 },
        { entryDate: "2026-08-09", leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 },
      ],
      expectedWorkingDates: null,
    });

    const html = renderToStaticMarkup(
      createElement(ProducerScorecardPreview, { preview, overview }),
    );

    expect(html).toContain("Tracking Consistency: 0 out of 5 stars");
    expect(html).toContain("August 2: Logged — Sunday not scored");
    expect(html).toContain("August 9: Logged — Sunday not scored");
    expect(html).toContain("0.75 weighted score");
  });
});
