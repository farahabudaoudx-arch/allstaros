import { notFound } from "next/navigation";
import protectedFixture from "@/lib/scorecards/fixtures/protected-producer-january-2026.json";
import { createMonthlyProducerPreview } from "@/lib/scorecards/lifecycle";
import { ScorecardsPageShell } from "@/components/scorecards/ProducerScorecardPreview";

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

  return (
    <div className="min-h-dvh bg-background text-ink">
      <ScorecardsPageShell preview={preview} />
    </div>
  );
}
