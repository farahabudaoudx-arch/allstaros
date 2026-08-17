import { notFound } from "next/navigation";
import { ScorecardsPageShell } from "@/components/scorecards/ProducerScorecardPreview";
import protectedFixture from "@/lib/scorecards/fixtures/protected-producer-july-2026.json";
import {
  createMonthlyProducerPreview,
  createProducerOverview,
} from "@/lib/scorecards/lifecycle";

export default function ProducerScorecardVisualPreviewPage() {
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

  return (
    <div className="min-h-dvh bg-background text-ink">
      <ScorecardsPageShell preview={preview} overview={overview} />
    </div>
  );
}
