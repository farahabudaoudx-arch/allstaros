import { notFound } from "next/navigation";
import protectedFixture from "@/lib/scorecards/fixtures/protected-producer-july-2026.json";
import {
  createMonthlyProducerPreview,
  createProducerOverview,
} from "@/lib/scorecards/lifecycle";
import { ScorecardsPageShell } from "@/components/scorecards/ProducerScorecardPreview";
import { BuilderScorecardPreview, type BuilderScorecardView } from "@/components/scorecards/BuilderScorecardPreview";

const builderView = {
  member: { fullName: "Jackson Rapaport", photoUrl: "https://api.allstarlifegroup.com/storage/v1/object/public/headshots/aa7642c5-7b10-473e-ac8f-b9c21f958354.jpg?v=1784920841727" },
  period: { kind: "monthly", label: "July 2026", previousLabel: "June 2026" },
  metric: {
    teamIpCents: 12_860_400,
    teamRank: { rank: 4, population: 27 },
    teamRankUnavailableReason: null,
    activeWriters: 8,
    firstLegPercent: 38.4,
    averageMonthlyIpPerWriterCents: 1_607_550,
    monthCount: 1,
    growth: { comparison: "mom", priorTeamIpCents: 10_940_200, currentTeamIpCents: 12_860_400, percentage: 17.6 },
    recruitsAdded: 6,
    recruitingRank: { rank: 2, population: 31 },
    trend: [
      { reportDate: "2026-07-03", label: "Week 1", teamIpCents: 2_740_000, share: 73 },
      { reportDate: "2026-07-10", label: "Week 2", teamIpCents: 3_760_400, share: 100 },
      { reportDate: "2026-07-17", label: "Week 3", teamIpCents: 3_090_000, share: 82 },
      { reportDate: "2026-07-24", label: "Week 4", teamIpCents: 3_270_000, share: 87 },
    ],
  },
} satisfies BuilderScorecardView;

/** Local visual-acceptance route. Production returns 404, and the fixture is
 * anonymized and stripped of personal/client data. The authenticated member
 * experience remains /producer/scorecards. */
export default function ScorecardsVisualPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

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
    photoUrl: "https://api.allstarlifegroup.com/storage/v1/object/public/headshots/aa7642c5-7b10-473e-ac8f-b9c21f958354.jpg?v=1784920841727",
    submittedApCents: protectedFixture.expected.submittedApCents,
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

  return (
    <div className="min-h-dvh bg-background text-ink">
      <ScorecardsPageShell preview={preview} overview={overview} />
      <main className="mx-auto w-full max-w-6xl px-5 pb-12 md:px-10">
        <BuilderScorecardPreview view={builderView} />
      </main>
    </div>
  );
}
