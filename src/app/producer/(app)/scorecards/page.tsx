import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { groupScorecardArchive, type ScorecardArchiveEntry } from "@/lib/scorecards/archive";
import { requirePublishedScorecardSnapshotPayload } from "@/lib/scorecards/published-snapshot";
import { createClient } from "@/lib/supabase/server";

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

  if (error) throw new Error("Unable to load the Scorecards archive.");
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
  const groups = groupScorecardArchive([...latest.values()]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <h1 className="text-4xl font-semibold tracking-[-0.035em] text-ink md:text-5xl">Scorecards</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-subtle">Published Producer and Builder reports you are authorized to view, preserved exactly as they were validated.</p>

      {groups.length === 0 ? (
        <div className="mt-10 border-l-2 border-accent pl-5">
          <h2 className="text-2xl font-semibold text-ink">No published Scorecards yet</h2>
          <p className="mt-3 text-base leading-7 text-subtle">Completed reports will appear here after the full organization dataset passes validation.</p>
        </div>
      ) : (
        <div className="mt-12 space-y-12">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`period-${group.key.replaceAll(":", "-")}`}>
              <h2 id={`period-${group.key.replaceAll(":", "-")}`} className="text-2xl font-semibold tracking-[-0.02em] text-ink">{group.label}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
