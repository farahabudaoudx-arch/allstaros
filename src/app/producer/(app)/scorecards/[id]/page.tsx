import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BuilderScorecardPreview, type BuilderScorecardMetric } from "@/components/scorecards/BuilderScorecardPreview";
import { ProducerScorecardPreview } from "@/components/scorecards/ProducerScorecardPreview";
import { getCurrentPerson } from "@/lib/auth";
import type { MonthlyProducerPreview, ProducerOverview } from "@/lib/scorecards/lifecycle";
import { previousEquivalentPeriod, scorecardPeriodFromStart } from "@/lib/scorecards/period";
import type { ScorecardPeriodKind } from "@/lib/scorecards/run";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Snapshot = {
  id: string;
  person_id: string;
  card_type: "producer" | "builder";
  period_kind: ScorecardPeriodKind;
  period_start: string;
  period_end: string;
  kpi_results: unknown;
  metric_run_id: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
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
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("scorecard_snapshot")
    .select("id, person_id, card_type, period_kind, period_start, period_end, kpi_results, metric_run_id")
    .eq("id", id)
    .eq("person_id", person.id)
    .in("lifecycle_status", ["final", "corrected"])
    .maybeSingle();
  if (error) throw new Error(`Unable to load this Scorecard: ${error.message}`);
  if (!data) notFound();
  const snapshot = data as Snapshot;

  let frozenName = person.full_name;
  let frozenPhoto = person.photo_url ?? null;
  if (snapshot.metric_run_id) {
    const { data: fact } = await service
      .from("person_role_status_fact")
      .select("full_name, photo_url")
      .eq("run_id", snapshot.metric_run_id)
      .eq("person_id", person.id)
      .maybeSingle();
    if (fact) {
      frozenName = String(fact.full_name);
      frozenPhoto = fact.photo_url == null ? null : String(fact.photo_url);
    }
  }

  const period = scorecardPeriodFromStart(snapshot.period_kind, snapshot.period_start);
  if (period.end !== snapshot.period_end) throw new Error("Stored Scorecard period does not match its period kind.");
  const previousPeriod = previousEquivalentPeriod(period);
  const label = period.label;
  const card = snapshot.card_type === "producer"
    ? producerPayload(snapshot.kpi_results)
    : builderPayload(snapshot.kpi_results);
  if (!card) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <Link href="/producer/scorecards" className="mb-6 inline-block text-sm font-medium text-accent hover:underline">Back to Scorecards</Link>
      {snapshot.card_type === "producer" ? (
        <ProducerScorecardPreview
          preview={(card as { preview: MonthlyProducerPreview }).preview}
          overview={(card as { overview: ProducerOverview }).overview}
          periodKind={snapshot.period_kind}
        />
      ) : (
        <BuilderScorecardPreview view={{
          member: { fullName: frozenName, photoUrl: frozenPhoto },
          period: { kind: snapshot.period_kind, label, previousLabel: previousPeriod.label },
          metric: card as BuilderScorecardMetric,
        }} />
      )}
    </main>
  );
}
