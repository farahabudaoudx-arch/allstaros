import { notFound } from "next/navigation";
import { ScorecardSnapshotDetail } from "@/components/scorecards/ScorecardSnapshotDetail";
import { requireAdmin } from "@/lib/admin/guard";
import { requirePublishedScorecardSnapshotPayload } from "@/lib/scorecards/published-snapshot";
import {
  builderScorecardPayload,
  isScorecardSnapshotUuid,
  producerScorecardPayload,
  type ScorecardSnapshotRow,
} from "@/lib/scorecards/snapshot-detail";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminScorecardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/scorecards/${id}`);
  if (!isScorecardSnapshotUuid(id)) notFound();

  const { data, error } = await createServiceRoleClient()
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
      backHref="/admin/scorecards"
      backLabel="Back to Scorecards admin"
    />
  );
}
