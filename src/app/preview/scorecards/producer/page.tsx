import { notFound } from "next/navigation";
import { ScorecardsPageShell } from "@/components/scorecards/ProducerScorecardPreview";
import mayaFixture from "@/lib/scorecards/fixtures/maya-producer-demo.json";
import type { MonthlyProducerPreview, ProducerOverview } from "@/lib/scorecards/lifecycle";
import protectedFixture from "@/lib/scorecards/fixtures/protected-producer-july-2026.json";
import {
  createMonthlyProducerPreview,
  createProducerOverview,
} from "@/lib/scorecards/lifecycle";

export default async function ProducerScorecardVisualPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();

  const params = await searchParams;
  if (params.member === "maya") {
    return <div className="min-h-dvh bg-background text-ink"><ScorecardsPageShell
      preview={mayaFixture.metricPayload.preview as MonthlyProducerPreview}
      overview={mayaFixture.metricPayload.overview as ProducerOverview}
    /></div>;
  }
  const longName = params.name === "long";
  const initials = params.photo === "initials";
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
    fullName: longName ? "Alexandria Montgomery-Rapaport The Third" : "Jackson Rapaport",
    photoUrl: initials
      ? null
      : "https://api.allstarlifegroup.com/storage/v1/object/public/headshots/aa7642c5-7b10-473e-ac8f-b9c21f958354.jpg?v=1784920841727",
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

  return (
    <div className="min-h-dvh bg-background text-ink">
      <ScorecardsPageShell preview={preview} overview={overview} />
    </div>
  );
}
