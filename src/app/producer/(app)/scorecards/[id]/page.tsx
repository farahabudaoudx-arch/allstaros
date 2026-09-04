import { notFound, redirect } from "next/navigation";
import { ScorecardSnapshotDetail } from "@/components/scorecards/ScorecardSnapshotDetail";
import { getCurrentPerson } from "@/lib/auth";
import { loadGatewayConnectionState } from "@/lib/gateway/connection";
import { scorecardLookbackVisible } from "@/lib/scorecards/gateway-visibility";
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
    .select("id, person_id, card_type, period_kind, period_start, period_end, kpi_results")
    .eq("id", id)
    .in("lifecycle_status", ["final", "corrected"])
    .maybeSingle();
  if (error) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
        <h1 className="text-4xl font-semibold tracking-[-0.035em] text-ink">Scorecards</h1>
        <section className="mt-10 rounded-2xl border border-hairline bg-card px-6 py-12 text-center">
          <h2 className="text-2xl font-semibold text-ink">This Scorecard is temporarily unavailable</h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-subtle">
            The report could not be loaded. Tracker, clients, and the menu still work.
          </p>
        </section>
      </main>
    );
  }
  if (!data) notFound();
  const snapshot = data as ScorecardSnapshotRow & { person_id: string };
  const ownerConnection = await loadGatewayConnectionState(snapshot.person_id);
  if (!scorecardLookbackVisible(ownerConnection)) notFound();

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
