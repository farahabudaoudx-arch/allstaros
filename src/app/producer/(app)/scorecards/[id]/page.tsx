import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BuilderScorecardPreview, type BuilderScorecardMetric } from "@/components/scorecards/BuilderScorecardPreview";
import { ProducerScorecardPreview } from "@/components/scorecards/ProducerScorecardPreview";
import { getCurrentPerson } from "@/lib/auth";
import type { MonthlyProducerPreview, ProducerOverview } from "@/lib/scorecards/lifecycle";
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

function periodLabel(kind: ScorecardPeriodKind, start: string) {
  const date = new Date(`${start}T00:00:00Z`);
  const year = date.getUTCFullYear();
  if (kind === "annual") return String(year);
  if (kind === "quarterly") return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${year}`;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function previousPeriodLabel(kind: ScorecardPeriodKind, start: string) {
  const date = new Date(`${start}T00:00:00Z`);
  if (kind === "annual") return String(date.getUTCFullYear() - 1);
  if (kind === "quarterly") {
    date.setUTCMonth(date.getUTCMonth() - 3);
    return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
  }
  date.setUTCMonth(date.getUTCMonth() - 1);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

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

  const label = periodLabel(snapshot.period_kind, snapshot.period_start);
  const card = snapshot.card_type === "producer"
    ? producerPayload(snapshot.kpi_results)
    : builderPayload(snapshot.kpi_results);
  if (!card) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <Link href="/producer/scorecards" className="mb-6 inline-block text-sm font-medium text-accent hover:underline">Back to Scorecards</Link>
      {snapshot.card_type === "producer" ? (
        <ProducerScorecardPreview preview={(card as { preview: MonthlyProducerPreview }).preview} overview={(card as { overview: ProducerOverview }).overview} />
      ) : (
        <BuilderScorecardPreview view={{
          member: { fullName: frozenName, photoUrl: frozenPhoto },
          period: { kind: snapshot.period_kind, label, previousLabel: previousPeriodLabel(snapshot.period_kind, snapshot.period_start) },
          metric: card as BuilderScorecardMetric,
        }} />
      )}
    </main>
  );
}
