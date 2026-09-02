import { notFound, redirect } from "next/navigation";
import { ScorecardSnapshotDetail } from "@/components/scorecards/ScorecardSnapshotDetail";
import { getCurrentPerson } from "@/lib/auth";
import { requirePublishedScorecardSnapshotPayload } from "@/lib/scorecards/published-snapshot";
import {
  builderScorecardPayload,
  isScorecardSnapshotUuid,
  producerScorecardPayload,
  type ScorecardSnapshotRow,
} from "@/lib/scorecards/snapshot-detail";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ScorecardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/scorecards");
  const { id } = await params;
  if (!isScorecardSnapshotUuid(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scorecard_snapshot")
    .select("id, card_type, period_kind, period_start, period_end, kpi_results")
    .eq("id", id)
    .in("lifecycle_status", ["final", "corrected"])
    .maybeSingle();
  if (error) throw new Error("Unable to load this Scorecard.");
  if (!data) notFound();
  const snapshot = data as ScorecardSnapshotRow;

  const published = requirePublishedScorecardSnapshotPayload({
    id: snapshot.id,
    cardType: snapshot.card_type,
    periodKind: snapshot.period_kind,
    periodStart: snapshot.period_start,
    periodEnd: snapshot.period_end,
    kpiResults: snapshot.kpi_results,
  });
  const card = published.cardType === "producer"
    ? producerScorecardPayload(published.metricPayload)
    : builderScorecardPayload(published.metricPayload);
  if (!card) throw new Error("Published Scorecard metric payload is incomplete or malformed.");

  return (
    <ScorecardSnapshotDetail
      cardType={snapshot.card_type}
      published={published}
      card={card}
      backHref="/producer/scorecards"
    />
  );
}
