import Link from "next/link";
import { BuilderScorecardPreview, type BuilderScorecardMetric } from "@/components/scorecards/BuilderScorecardPreview";
import { ProducerScorecardPreview } from "@/components/scorecards/ProducerScorecardPreview";
import type { MonthlyProducerPreview, ProducerOverview } from "@/lib/scorecards/lifecycle";
import type { PublishedScorecardSnapshotPayload } from "@/lib/scorecards/published-snapshot";

type ProducerCard = { preview: MonthlyProducerPreview; overview: ProducerOverview };
type ScorecardCard = ProducerCard | BuilderScorecardMetric;

export function ScorecardSnapshotDetail({
  cardType,
  published,
  card,
  backHref,
  backLabel = "Back to Scorecards",
}: {
  cardType: "producer" | "builder";
  published: PublishedScorecardSnapshotPayload;
  card: ScorecardCard;
  backHref: string;
  backLabel?: string;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <Link href={backHref} className="mb-6 inline-block text-sm font-medium text-accent hover:underline">
        {backLabel}
      </Link>
      {cardType === "builder" ? <p className="mb-6 text-sm text-subtle">Ratings use the current scoring rules applied to this period&apos;s saved data.</p> : null}
      {cardType === "producer" ? (
        <ProducerScorecardPreview
          preview={(card as ProducerCard).preview}
          overview={{
            ...(card as ProducerCard).overview,
            producer: {
              ...(card as ProducerCard).overview.producer,
              fullName: published.member.fullName,
              photoUrl: published.member.photoUrl,
            },
          }}
          periodKind={published.period.kind}
          frozenScore={published.cardType === "producer" ? published.score : undefined}
        />
      ) : (
        <BuilderScorecardPreview
          view={{
            member: published.member,
            period: {
              kind: published.period.kind,
              label: published.period.label,
              previousLabel: published.period.previous.label,
            },
            metric: card as BuilderScorecardMetric,
          }}
        />
      )}
    </main>
  );
}
