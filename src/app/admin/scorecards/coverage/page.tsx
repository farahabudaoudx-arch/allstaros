import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { loadGatewayCoverageReport, type GatewayCoverageScope } from "@/lib/scorecards/coverage";
import { scorecardPeriodFromStart } from "@/lib/scorecards/period";
import type { ScorecardPeriodKind } from "@/lib/scorecards/run";
import { currentMonthlyPeriod } from "@/lib/scorecards/source";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GatewayCoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; periodKind?: string; periodStart?: string }>;
}) {
  await requireAdmin("/admin/scorecards/coverage");
  const params = await searchParams;
  const scope: GatewayCoverageScope = ["all", "producer", "builder"].includes(params.scope ?? "")
    ? params.scope as GatewayCoverageScope
    : "all";
  const periodKind: ScorecardPeriodKind = ["monthly", "quarterly", "annual"].includes(params.periodKind ?? "")
    ? params.periodKind as ScorecardPeriodKind
    : "monthly";
  const currentPeriod = currentMonthlyPeriod();
  const periodStart = params.periodStart ?? currentPeriod.start;

  let report: Awaited<ReturnType<typeof loadGatewayCoverageReport>> | null = null;
  let error: string | null = null;
  try {
    const period = scorecardPeriodFromStart(periodKind, periodStart);
    report = await loadGatewayCoverageReport(createServiceRoleClient(), period, scope);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to load Gateway coverage.";
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <Link href="/admin/scorecards" className="text-sm font-medium text-accent underline underline-offset-4">← Scorecard rollout</Link>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em] text-ink md:text-5xl">Gateway Coverage</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-subtle">
            Producer coverage requires an imported WTD Gateway row with <code>personal_ip_cents</code> in the selected period. Team IP never counts as Producer coverage. Builder coverage requires an imported WTD row with <code>team_ip_cents</code>.
          </p>
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-mute">Read only</p>
      </div>

      <form method="get" className="mt-8 grid gap-4 border border-hairline bg-card p-5 md:grid-cols-4">
        <label className="text-sm text-subtle">Scope
          <select name="scope" defaultValue={scope} className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink">
            <option value="all">Producers + Builders</option>
            <option value="producer">Producers</option>
            <option value="builder">Builders</option>
          </select>
        </label>
        <label className="text-sm text-subtle">Period type
          <select name="periodKind" defaultValue={periodKind} className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
        <label className="text-sm text-subtle">Period start
          <input name="periodStart" type="date" defaultValue={periodStart} className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink" />
        </label>
        <button type="submit" className="self-end rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90">View coverage</button>
      </form>

      {error ? <p role="alert" className="mt-6 border-l-2 border-neg pl-4 text-sm text-neg">{error}</p> : null}
      {report ? (
        <section className="mt-8" aria-labelledby="coverage-results-title">
          <h2 id="coverage-results-title" className="text-xl font-semibold text-ink">{report.period.label}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[["In Scope", report.inScope], ["Covered", report.covered], ["Missing", report.missing], ["Coverage", `${report.coveragePercent}%`]].map(([label, value]) => (
              <div key={label} className="border border-hairline bg-card p-4"><dt className="text-xs text-mute">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</dd></div>
            ))}
          </dl>
          {report.missingPeople.length > 0 ? (
            <details className="mt-6 border border-hairline bg-card p-5">
              <summary className="cursor-pointer text-sm font-semibold text-ink">Missing Gateway coverage ({report.missing})</summary>
              <ul className="mt-4 grid gap-2 text-sm text-subtle md:grid-cols-2">
                {report.missingPeople.slice(0, 40).map((person) => (
                  <li key={`${person.cardType}:${person.personId}`} className="border border-hairline bg-background px-3 py-2">
                    <span className="font-medium text-ink">{person.fullName}</span> · {person.cardType === "producer" ? "Producer" : "Builder"}{person.email ? ` · ${person.email}` : ""}
                  </li>
                ))}
              </ul>
              {report.missingPeople.length > 40 ? <p className="mt-3 text-xs text-mute">Showing the first 40 missing card scopes.</p> : null}
            </details>
          ) : <p className="mt-6 text-sm text-pos">All eligible card scopes have Gateway coverage for this period.</p>}
        </section>
      ) : null}
    </main>
  );
}
