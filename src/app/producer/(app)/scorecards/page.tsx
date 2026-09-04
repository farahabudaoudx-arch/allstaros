import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { groupScorecardArchive, type ScorecardArchiveEntry } from "@/lib/scorecards/archive";
import {
  filterScorecardArchiveByGatewayConnection,
  uncreatedScorecardPlaceholders,
  type UncreatedScorecardPlaceholder,
} from "@/lib/scorecards/gateway-visibility";
import { requirePublishedScorecardSnapshotPayload } from "@/lib/scorecards/published-snapshot";
import { candidateClosedPeriods } from "@/lib/scorecards/auto-publish";
import { createClient } from "@/lib/supabase/server";
import { loadGatewayConnectionState, loadGatewayConnectionStates } from "@/lib/gateway/connection";
import {
  GATEWAY_NEVER_CONNECTED_COPY,
  GATEWAY_RECONNECT_COPY,
  GATEWAY_SCORECARD_NOT_CREATED_COPY,
  type GatewayConnectionState,
} from "@/lib/gateway/connection-types";

export const dynamic = "force-dynamic";

type SnapshotRow = {
  id: string;
  person_id: string;
  card_type: "producer" | "builder";
  period_kind: "monthly" | "quarterly" | "annual";
  period_start: string;
  period_end: string;
  lifecycle_status: "final" | "corrected";
  revision: number;
  finalized_at: string;
  kpi_results: unknown;
};

function UncreatedScorecardCard({ placeholder }: { placeholder: UncreatedScorecardPlaceholder }) {
  return (
    <div className="rounded-xl border border-hairline bg-card p-5 sm:p-6">
      <h3 className="break-words text-xl font-semibold leading-tight text-ink">
        {placeholder.cardType === "producer" ? "Producer Scorecard" : "Builder Scorecard"}
      </h3>
      <p className="mt-2 break-words text-base font-medium leading-6 text-ink">{placeholder.memberName}</p>
      <p className="mt-3 text-sm leading-6 text-subtle">{GATEWAY_SCORECARD_NOT_CREATED_COPY}</p>
    </div>
  );
}

function ScorecardsLoadError() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <h1 className="text-4xl font-semibold tracking-[-0.035em] text-ink md:text-5xl">Scorecards</h1>
      <section className="mt-10 rounded-2xl border border-hairline bg-card px-6 py-12 text-center">
        <h2 className="text-2xl font-semibold text-ink">Scorecards is temporarily unavailable</h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-subtle">
          The archive could not be loaded. Tracker, clients, and the menu still work.
        </p>
      </section>
    </main>
  );
}

function viewerScorecardsNotice(
  state: GatewayConnectionState,
  duePeriodMissing: boolean,
) {
  if (state.status === "unavailable") {
    return "Gateway connection status is temporarily unavailable. Scorecards that need a verified connection are hidden until it can be checked.";
  }
  if (!state.everConnected) {
    return GATEWAY_NEVER_CONNECTED_COPY;
  }
  if (!state.connected && duePeriodMissing) {
    return GATEWAY_SCORECARD_NOT_CREATED_COPY;
  }
  if (!state.connected) {
    return GATEWAY_RECONNECT_COPY;
  }
  return null;
}

export default async function ScorecardsPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/scorecards");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scorecard_snapshot")
    .select("id, person_id, card_type, period_kind, period_start, period_end, lifecycle_status, revision, finalized_at, kpi_results")
    .in("lifecycle_status", ["final", "corrected"])
    .not("finalized_at", "is", null)
    .order("period_start", { ascending: false })
    .order("revision", { ascending: false });

  if (error) return <ScorecardsLoadError />;

  const latest = new Map<string, ScorecardArchiveEntry>();
  for (const row of (data ?? []) as SnapshotRow[]) {
    const key = `${row.person_id}:${row.card_type}:${row.period_kind}:${row.period_start}`;
    if (latest.has(key)) continue;
    const published = requirePublishedScorecardSnapshotPayload({
      id: row.id,
      cardType: row.card_type,
      periodKind: row.period_kind,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      kpiResults: row.kpi_results,
    });
    const overallResult = published.cardType === "producer"
      ? `${published.score.overall.toFixed(2)} / 5`
      : `${published.score.average.toFixed(1)} / 5`;
    latest.set(key, {
      id: row.id,
      personId: row.person_id,
      memberName: published.member.fullName,
      cardType: row.card_type,
      periodKind: row.period_kind,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      periodLabel: published.period.label,
      overallResult,
      revision: row.revision,
      lifecycleStatus: row.lifecycle_status,
      finalizedAt: row.finalized_at,
    });
  }

  const allEntries = [...latest.values()];
  const personIds = [...new Set([person.id, ...allEntries.map((entry) => entry.personId)])];
  const [viewerConnection, connectionStates] = await Promise.all([
    loadGatewayConnectionState(person.id),
    loadGatewayConnectionStates(personIds),
  ]);
  connectionStates.set(person.id, viewerConnection);

  const visibleEntries = filterScorecardArchiveByGatewayConnection(allEntries, connectionStates);
  const duePeriod = candidateClosedPeriods(new Date())[0];
  const placeholders = uncreatedScorecardPlaceholders({
    duePeriod,
    entries: visibleEntries,
    states: connectionStates,
  });
  const groups = groupScorecardArchive(visibleEntries);
  const ownPublished = visibleEntries.filter((entry) => entry.personId === person.id);
  const duePeriodMissing = !ownPublished.some(
    (entry) => entry.periodKind === duePeriod.kind && entry.periodStart === duePeriod.start,
  );
  const notice = viewerScorecardsNotice(viewerConnection, duePeriodMissing);
  const neverConnectedEmpty = !viewerConnection.everConnected && visibleEntries.length === 0;
  const dueGroupKey = `${duePeriod.kind}:${duePeriod.start}`;
  const dueGroupExists = groups.some((group) => group.key === dueGroupKey);
  const leadingPlaceholders = dueGroupExists ? [] : placeholders;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <h1 className="text-4xl font-semibold tracking-[-0.035em] text-ink md:text-5xl">Scorecards</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-subtle">
        Published Producer and Builder reports you are authorized to view, preserved exactly as they were validated.
      </p>

      {notice ? (
        <section className="mt-6 rounded-2xl border border-hairline bg-card px-5 py-4">
          <p className="text-sm leading-6 text-subtle">{notice}</p>
          {viewerConnection.status !== "unavailable" && !viewerConnection.connected ? (
            <Link
              href="/producer?settings=gateway"
              className="mt-3 inline-flex rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black"
            >
              {viewerConnection.everConnected ? "Reconnect Gateway" : "Connect Gateway"}
            </Link>
          ) : null}
        </section>
      ) : null}

      {neverConnectedEmpty ? (
        <div className="mt-10 border-l-2 border-accent pl-5">
          <h2 className="text-2xl font-semibold text-ink">No Scorecards to look back at</h2>
          <p className="mt-3 text-base leading-7 text-subtle">{GATEWAY_NEVER_CONNECTED_COPY}</p>
        </div>
      ) : groups.length === 0 && placeholders.length === 0 ? (
        <div className="mt-10 border-l-2 border-accent pl-5">
          <h2 className="text-2xl font-semibold text-ink">No published Scorecards yet</h2>
          <p className="mt-3 text-base leading-7 text-subtle">Completed reports will appear here after the full organization dataset passes validation.</p>
        </div>
      ) : (
        <div className="mt-12 space-y-12">
          {leadingPlaceholders.length > 0 ? (
            <section aria-labelledby="uncreated-scorecards">
              <h2 id="uncreated-scorecards" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
                {duePeriod.label}
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {leadingPlaceholders.map((placeholder) => (
                  <UncreatedScorecardCard key={`${placeholder.personId}:${placeholder.cardType}:${placeholder.periodStart}`} placeholder={placeholder} />
                ))}
              </div>
            </section>
          ) : null}
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`period-${group.key.replaceAll(":", "-")}`}>
              <h2 id={`period-${group.key.replaceAll(":", "-")}`} className="text-2xl font-semibold tracking-[-0.02em] text-ink">{group.label}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {group.key === dueGroupKey
                  ? placeholders.map((placeholder) => (
                      <UncreatedScorecardCard key={`${placeholder.personId}:${placeholder.cardType}:${placeholder.periodStart}`} placeholder={placeholder} />
                    ))
                  : null}
                {group.entries.map((entry) => (
                  <Link key={entry.id} href={`/producer/scorecards/${entry.id}`} className="rounded-xl border border-hairline bg-card p-5 transition-colors hover:border-accent hover:bg-card-hi focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="break-words text-xl font-semibold leading-tight text-ink">{entry.cardType === "producer" ? "Producer Scorecard" : "Builder Scorecard"}</h3>
                        <p className="mt-2 break-words text-base font-medium leading-6 text-ink">{entry.memberName}</p>
                        <p className="mt-1 text-sm leading-5 text-subtle">{entry.periodKind === "annual" ? "Annual" : entry.periodKind === "quarterly" ? "Quarterly" : "Monthly"} report</p>
                      </div>
                      <div className="shrink-0 sm:text-right">
                        <p className="text-xs font-medium uppercase tracking-[0.08em] text-mute">Overall</p>
                        <p className="mt-1 text-2xl font-semibold leading-none tabular-nums text-accent">{entry.overallResult}</p>
                        <span className="mt-3 inline-block text-sm font-medium text-accent">Open report</span>
                      </div>
                    </div>
                    {entry.lifecycleStatus === "corrected" ? <p className="mt-6 border-t border-hairline pt-4 text-sm leading-5 text-mute">Corrected revision {entry.revision}</p> : null}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
