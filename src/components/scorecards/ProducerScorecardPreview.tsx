import type {
  IssuanceStatus,
  MonthlyProducerPreview,
  ProducerActivityTotals,
  ProducerOverview,
} from "@/lib/scorecards/lifecycle";
import { ISSUANCE_THRESHOLD_SUMMARY } from "@/lib/scorecards/lifecycle";
import { Avatar } from "@/components/Avatar";

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
  overview,
}: {
  preview: MonthlyProducerPreview;
  overview: ProducerOverview;
}) {
  const headline = STATUS_COPY[preview.issuanceStatus];
  const growth =
    overview.growth.kind === "new_baseline"
      ? "New baseline"
      : `${overview.growth.percentage > 0 ? "+" : ""}${overview.growth.percentage}%`;
  const consistency = overview.activity.consistency;

  return (
    <article aria-labelledby="producer-scorecard-title" className="overflow-hidden rounded-[1.4rem] border border-hairline bg-card">
      <header className="border-b border-hairline px-5 pb-7 pt-8 text-center sm:px-7 sm:pb-8 sm:pt-10">
        <Avatar
          name={overview.producer.fullName}
          photoUrl={overview.producer.photoUrl}
          className="mx-auto h-24 w-24 text-2xl ring-4 ring-card outline outline-1 outline-offset-4 outline-hairline sm:h-28 sm:w-28"
        />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <h2 id="producer-scorecard-title" className="text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-3xl">
            {overview.producer.fullName}
          </h2>
          <span className="text-sm font-medium text-subtle">In progress</span>
        </div>
        <p className="mt-2 text-sm font-medium text-subtle">{overview.producer.role}</p>
        <p className="mt-1 text-sm text-mute">{preview.title}</p>
      </header>

      <section aria-labelledby="overview-title" className="px-5 py-7 sm:px-7 sm:py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="overview-title" className="text-base font-semibold text-ink">At a glance</h3>
            <p className="mt-1 text-sm text-subtle">Your complete monthly Producer picture.</p>
          </div>
          <p className="text-xs text-mute">Live preview · updates as source data arrives</p>
        </div>

        <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          <OverviewMetric label="Issued IP" value={money(preview.totalIssuedIpCents)} detail={`${preview.sourceCoverage.reportCount} Gateway reports`} />
          <OverviewMetric label="Submitted AP" value={overview.submittedApCents == null ? "Unavailable" : money(overview.submittedApCents)} detail="Submitted business" />
          <OverviewMetric
            label="Average weekly IP"
            value={money(preview.averageWeeklyIpCents)}
            detail={`${headline.label} issuance`}
            valueClass={headline.textClass}
            detailClass={headline.textClass}
            ariaLabel={`${headline.label} issuance status`}
          />
          <OverviewMetric label="Month-over-month" value={growth} detail="Personal Gateway IP" />
          <OverviewMetric label="Company rank" value={`#${overview.rank.rank} of ${overview.rank.population}`} detail={`${overview.rank.percentile}th percentile · ${overview.rank.movement == null ? "First ranking" : overview.rank.movement === 0 ? "No change" : `${overview.rank.movement > 0 ? "Up" : "Down"} ${Math.abs(overview.rank.movement)}`}`} />
          <OverviewMetric
            label="Tracking consistency"
            value={consistency ? `${consistency.percentage}%` : "Schedule needed"}
            detail={consistency ? `${consistency.loggedDays} of ${consistency.expectedDays} expected days` : `${overview.activity.trackedDays} tracked days · schedule not set`}
          />
        </div>
        <p className="mt-3 text-xs leading-5 text-mute">{ISSUANCE_THRESHOLD_SUMMARY}</p>
      </section>

      <ActivityOverview activity={overview.activity} />

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

function OverviewMetric({
  label,
  value,
  detail,
  valueClass = "text-ink",
  detailClass = "text-mute",
  ariaLabel,
}: {
  label: string;
  value: string;
  detail: string;
  valueClass?: string;
  detailClass?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="min-h-32 bg-card px-5 py-5" aria-label={ariaLabel}>
      <p className="text-sm font-medium text-subtle">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-[-0.03em] tabular-nums ${valueClass}`}>{value}</p>
      <p className={`mt-2 text-xs ${detailClass}`}>{detail}</p>
    </div>
  );
}

const ACTIVITY_LABELS: Array<[keyof ProducerActivityTotals, string]> = [
  ["leads", "Leads"],
  ["dials", "Dials"],
  ["contacts", "Contacts"],
  ["appointments", "Appointments"],
  ["presentations", "Presentations"],
  ["sales", "Sales"],
];

function ActivityOverview({ activity }: { activity: ProducerOverview["activity"] }) {
  return (
    <section aria-labelledby="activity-title" className="border-t border-hairline px-5 py-7 sm:px-7 sm:py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 id="activity-title" className="text-base font-semibold text-ink">Activity</h3>
          <p className="mt-1 text-sm text-subtle">Totals and pace across submitted tracker days.</p>
        </div>
        <p className="text-xs text-mute">{activity.trackedDays} tracked {activity.trackedDays === 1 ? "day" : "days"}</p>
      </div>
      {activity.availability !== "tracked" || !activity.totals || !activity.perTrackedDay ? (
        <div className="mt-5 rounded-xl border border-dashed border-hairline px-5 py-7">
          <p className="text-sm font-medium text-ink">{activity.availability === "partial" ? "Activity data is incomplete" : "No tracker submissions yet"}</p>
          <p className="mt-2 text-sm leading-6 text-subtle">Activity is missing, not zero. {activity.availability === "partial" ? "Complete the missing tracker fields to establish an accurate pace." : "Submit a tracker day—even an intentional zero day—to establish your pace."}</p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5 border-y border-hairline py-5 sm:grid-cols-3 lg:grid-cols-6">
          {ACTIVITY_LABELS.map(([key, label]) => (
            <div key={key}>
              <p className="text-xs text-mute">{label}</p>
              <p className="mt-1 text-xl font-semibold text-ink tabular-nums">{activity.totals![key].toLocaleString()}</p>
              <p className="mt-1 text-xs text-subtle">{activity.perTrackedDay![key].toLocaleString()} / day</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ScorecardsPageShell({ preview, overview }: { preview: MonthlyProducerPreview; overview: ProducerOverview }) {
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
        <ProducerScorecardPreview preview={preview} overview={overview} />
      </div>
    </main>
  );
}
