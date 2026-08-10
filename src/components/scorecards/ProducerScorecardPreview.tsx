import type {
  IssuanceStatus,
  MonthlyProducerPreview,
} from "@/lib/scorecards/lifecycle";
import { ISSUANCE_THRESHOLD_SUMMARY } from "@/lib/scorecards/lifecycle";

const STATUS_COPY: Record<
  IssuanceStatus,
  { label: string; textClass: string; borderClass: string; backgroundClass: string }
> = {
  green: {
    label: "Green",
    textClass: "text-pos",
    borderClass: "border-pos/35",
    backgroundClass: "bg-pos/[0.06]",
  },
  blue: {
    label: "Blue",
    textClass: "text-[#78a7ff] light:text-[#2859ad]",
    borderClass: "border-[#78a7ff]/35 light:border-[#2859ad]/30",
    backgroundClass: "bg-[#78a7ff]/[0.06] light:bg-[#2859ad]/[0.05]",
  },
  red: {
    label: "Red",
    textClass: "text-neg",
    borderClass: "border-neg/35",
    backgroundClass: "bg-neg/[0.06]",
  },
};

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function longDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function ScorecardPeriodControls() {
  return (
    <div className="flex flex-col gap-3 border-b border-hairline pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-medium text-ink">Current period</p>
        <p className="mt-1 text-sm text-subtle">Monthly preview updates with each Gateway report.</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-hairline bg-card p-1" aria-label="Scorecard period">
        <button type="button" aria-pressed="true" className="rounded-lg bg-card-hi px-3 py-2 text-sm font-medium text-ink ring-1 ring-hairline">
          Monthly
        </button>
        <button type="button" disabled title="Quarterly Scorecards arrive after Q4 2026" className="rounded-lg px-3 py-2 text-sm text-mute disabled:cursor-not-allowed">
          Quarterly
        </button>
        <button type="button" disabled title="Yearly Scorecards arrive after 2027" className="rounded-lg px-3 py-2 text-sm text-mute disabled:cursor-not-allowed">
          Yearly
        </button>
      </div>
    </div>
  );
}

export function ProducerScorecardPreview({
  preview,
}: {
  preview: MonthlyProducerPreview;
}) {
  const headline = STATUS_COPY[preview.issuanceStatus];

  return (
    <article aria-labelledby="producer-scorecard-title" className="overflow-hidden rounded-[1.4rem] border border-hairline bg-card">
      <header className="border-b border-hairline px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 id="producer-scorecard-title" className="text-xl font-semibold tracking-[-0.025em] text-ink sm:text-2xl">
                Producer
              </h2>
              <span className="rounded-md border border-hairline bg-card-hi px-2 py-1 text-xs font-medium text-subtle">
                In progress
              </span>
            </div>
            <p className="mt-2 text-sm text-subtle">{preview.periodLabel} · Gateway issued premium</p>
          </div>
          <p className="max-w-xs text-sm leading-6 text-subtle sm:text-right">
            Live preview. Official Scorecards are preserved only after the period closes and source data is complete.
          </p>
        </div>
      </header>

      <div className="grid gap-px bg-hairline lg:grid-cols-[1.2fr_0.8fr]">
        <section aria-label="Issued premium summary" className="bg-card px-5 py-7 sm:px-7 sm:py-8">
          <p className="text-sm font-medium text-subtle">Total issued IP</p>
          <p className="mt-2 text-4xl font-semibold tracking-[-0.045em] text-ink tabular-nums sm:text-5xl">
            {money(preview.totalIssuedIpCents)}
          </p>
          <p className="mt-3 text-sm leading-6 text-subtle">
            Across {preview.sourceCoverage.reportCount} Gateway {preview.sourceCoverage.reportCount === 1 ? "report" : "reports"} this month.
          </p>
        </section>

        <section aria-label={`${headline.label} issuance status`} className="bg-card px-5 py-7 sm:px-7 sm:py-8">
          <div className={`rounded-xl border p-4 ${headline.borderClass} ${headline.backgroundClass}`}>
            <p className="text-sm font-medium text-subtle">Average weekly IP</p>
            <p className={`mt-2 text-3xl font-semibold tracking-[-0.035em] tabular-nums ${headline.textClass}`}>
              {money(preview.averageWeeklyIpCents)}
            </p>
            <p className={`mt-2 text-sm font-semibold ${headline.textClass}`}>{headline.label} issuance</p>
          </div>
          <p className="mt-3 text-xs leading-5 text-mute">
            {ISSUANCE_THRESHOLD_SUMMARY}
          </p>
        </section>
      </div>

      <section aria-labelledby="weekly-reports-title" className="border-t border-hairline px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id="weekly-reports-title" className="text-base font-semibold text-ink">Weekly Gateway reports</h3>
          {preview.sourceCoverage.completeThrough ? (
            <p className="text-xs text-mute">Through {longDate(preview.sourceCoverage.completeThrough)}</p>
          ) : null}
        </div>

        {preview.weeklyReports.length ? (
          <div className="mt-4 divide-y divide-hairline border-y border-hairline">
            {preview.weeklyReports.map((week) => {
              const status = STATUS_COPY[week.issuanceStatus];
              return (
                <div key={week.reportDate} className="grid grid-cols-[1fr_auto] items-center gap-4 py-4 sm:grid-cols-[1fr_11rem_6rem]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{week.label}</p>
                    <p className="mt-1 text-xs text-mute">{longDate(week.reportDate)}</p>
                  </div>
                  <p className={`text-right text-base font-semibold tabular-nums sm:text-left ${status.textClass}`}>
                    {money(week.personalIpCents)}
                  </p>
                  <p className={`col-span-2 text-xs font-medium sm:col-span-1 sm:text-right ${status.textClass}`}>
                    {status.label}
                    <span className="sr-only"> issuance status</span>
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-hairline px-5 py-8 text-center">
            <p className="text-sm font-medium text-ink">Waiting for the first Gateway report</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-subtle">
              Your preview is ready. Weekly issued premium will appear here when this month’s first report arrives.
            </p>
          </div>
        )}

        {!preview.hasProduction && preview.weeklyReports.length ? (
          <div className="mt-5 border-l-2 border-accent pl-4">
            <p className="text-sm font-medium text-ink">A clear starting point</p>
            <p className="mt-1 text-sm leading-6 text-subtle">{preview.emptyMessage}</p>
          </div>
        ) : null}
      </section>
    </article>
  );
}

export function ScorecardsPageShell({ preview }: { preview: MonthlyProducerPreview }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">Scorecards</h1>
        <p className="mt-3 text-base leading-7 text-subtle">
          A focused review of your production, updated as authoritative company data arrives.
        </p>
      </div>
      <ScorecardPeriodControls />
      <div className="mt-6">
        <ProducerScorecardPreview preview={preview} />
      </div>
    </main>
  );
}
