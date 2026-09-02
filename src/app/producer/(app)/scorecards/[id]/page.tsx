import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BuilderScorecardPreview, type BuilderScorecardMetric } from "@/components/scorecards/BuilderScorecardPreview";
import { ProducerScorecardPreview } from "@/components/scorecards/ProducerScorecardPreview";
import { getCurrentPerson } from "@/lib/auth";
import type { MonthlyProducerPreview, ProducerOverview } from "@/lib/scorecards/lifecycle";
import { requirePublishedScorecardSnapshotPayload } from "@/lib/scorecards/published-snapshot";
import type { ScorecardPeriodKind } from "@/lib/scorecards/run";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Snapshot = {
  id: string;
  card_type: "producer" | "builder";
  period_kind: ScorecardPeriodKind;
  period_start: string;
  period_end: string;
  kpi_results: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function producerPayload(value: unknown): { preview: MonthlyProducerPreview; overview: ProducerOverview } | null {
  if (!isRecord(value) || !isRecord(value.preview) || !isRecord(value.overview)) return null;
  return value as { preview: MonthlyProducerPreview; overview: ProducerOverview };
}

function builderPayload(value: unknown): BuilderScorecardMetric | null {
  if (!isRecord(value)) return null;
  if (typeof value.teamIpCents !== "number" || typeof value.activeWriters !== "number") return null;
  if (!isRecord(value.growth) || !Array.isArray(value.trend) || !isRecord(value.recruitingRank)) return null;
  return value as BuilderScorecardMetric;
}

export default async function ScorecardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/scorecards");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  let { data, error } = await supabase
    .from("scorecard_snapshot")
    .select("id, card_type, period_kind, period_start, period_end, kpi_results")
    .eq("id", id)
    .in("lifecycle_status", ["final", "corrected"])
    .maybeSingle();
  // Admins generate cards they cannot see through member visibility (own row /
  // builder downline only). The rollout "Open published Scorecard" link would
  // 404 without a privileged read of that one artifact.
  if (!data && !error && (person.is_admin || person.is_super_admin)) {
    const privileged = await createServiceRoleClient()
      .from("scorecard_snapshot")
      .select("id, card_type, period_kind, period_start, period_end, kpi_results")
      .eq("id", id)
      .in("lifecycle_status", ["final", "corrected"])
      .maybeSingle();
    data = privileged.data;
    error = privileged.error;
  }
  if (error) throw new Error("Unable to load this Scorecard.");
  if (!data) notFound();
  const snapshot = data as Snapshot;

  const published = requirePublishedScorecardSnapshotPayload({
    id: snapshot.id,
    cardType: snapshot.card_type,
    periodKind: snapshot.period_kind,
    periodStart: snapshot.period_start,
    periodEnd: snapshot.period_end,
    kpiResults: snapshot.kpi_results,
  });
  const card = published.cardType === "producer"
    ? producerPayload(published.metricPayload)
    : builderPayload(published.metricPayload);
  if (!card) throw new Error("Published Scorecard metric payload is incomplete or malformed.");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <Link href="/producer/scorecards" className="mb-6 inline-block text-sm font-medium text-accent hover:underline">Back to Scorecards</Link>
      {snapshot.card_type === "producer" ? (
        <ProducerScorecardPreview
          preview={(card as { preview: MonthlyProducerPreview }).preview}
          overview={{
            ...(card as { overview: ProducerOverview }).overview,
            producer: {
              ...(card as { overview: ProducerOverview }).overview.producer,
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
          frozenScore={published.cardType === "builder" ? published.score : undefined}
        />
      )}
    </main>
  );
}
