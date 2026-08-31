import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { groupScorecardArchive, type ScorecardArchiveEntry } from "@/lib/scorecards/archive";
import { requirePublishedScorecardSnapshotPayload } from "@/lib/scorecards/published-snapshot";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SnapshotRow = {
  id: string;
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

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("scorecard_snapshot")
    .select("id, card_type, period_kind, period_start, period_end, lifecycle_status, revision, finalized_at, kpi_results")
    .eq("person_id", person.id)
    .in("lifecycle_status", ["final", "corrected"])
    .not("finalized_at", "is", null)
    .order("period_start", { ascending: false })
    .order("revision", { ascending: false });

  if (error) throw new Error(`Unable to load the Scorecards archive: ${error.message}`);
  const latest = new Map<string, ScorecardArchiveEntry>();
  for (const row of (data ?? []) as SnapshotRow[]) {
    const key = `${row.card_type}:${row.period_kind}:${row.period_start}`;
    if (latest.has(key)) continue;
    const published = requirePublishedScorecardSnapshotPayload({
      id: row.id,
      cardType: row.card_type,
      periodKind: row.period_kind,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      kpiResults: row.kpi_results,
    });
    latest.set(key, {
      id: row.id,
      cardType: row.card_type,
      periodKind: row.period_kind,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      periodLabel: published.period.label,
      revision: row.revision,
      lifecycleStatus: row.lifecycle_status,
      finalizedAt: row.finalized_at,
    });
  }
  const groups = groupScorecardArchive([...latest.values()]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <h1 className="text-4xl font-semibold tracking-[-0.035em] text-ink md:text-5xl">Scorecards</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-subtle">Your published Producer and Builder reports, preserved exactly as they were validated.</p>

      {groups.length === 0 ? (
        <div className="mt-10 border-l-2 border-accent pl-5">
          <h2 className="text-2xl font-semibold text-ink">No published Scorecards yet</h2>
          <p className="mt-3 text-sm leading-6 text-subtle">Completed reports will appear here after the full organization dataset passes validation.</p>
        </div>
      ) : (
        <div className="mt-12 space-y-12">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`period-${group.key.replaceAll(":", "-")}`}>
              <h2 id={`period-${group.key.replaceAll(":", "-")}`} className="text-2xl font-semibold tracking-[-0.02em] text-ink">{group.label}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {group.entries.map((entry) => (
                  <Link key={entry.id} href={`/producer/scorecards/${entry.id}`} className="rounded-xl border border-hairline bg-card p-6 transition-colors hover:border-accent hover:bg-card-hi focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold text-ink">{entry.cardType === "producer" ? "Producer Scorecard" : "Builder Scorecard"}</h3>
                        <p className="mt-2 text-sm text-subtle">{entry.periodKind === "annual" ? "Annual" : entry.periodKind === "quarterly" ? "Quarterly" : "Monthly"} report</p>
                      </div>
                      <span className="text-sm font-medium text-accent">Open report</span>
                    </div>
                    {entry.lifecycleStatus === "corrected" ? <p className="mt-6 border-t border-hairline pt-4 text-xs text-mute">Corrected revision {entry.revision}</p> : null}
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
