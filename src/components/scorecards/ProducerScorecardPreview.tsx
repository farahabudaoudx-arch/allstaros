import type {
  IssuanceStatus,
  MonthlyProducerPreview,
  ProducerActivityTotals,
  ProducerOverview,
} from "@/lib/scorecards/lifecycle";
import { ISSUANCE_THRESHOLD_SUMMARY } from "@/lib/scorecards/lifecycle";
import { Avatar } from "@/components/Avatar";
import type { ReactNode } from "react";
import { VelarisBackground } from "./VelarisBackground";

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
      <VelarisBackground>
        <header className="border-b border-white/10 px-5 pb-7 pt-8 text-center sm:px-7 sm:pb-8 sm:pt-10">
          <Avatar
            name={overview.producer.fullName}
            photoUrl={overview.producer.photoUrl}
            className="mx-auto h-24 w-24 text-2xl ring-4 ring-black/70 outline outline-1 outline-offset-4 outline-white/25 sm:h-28 sm:w-28"
          />
          <h2 id="producer-scorecard-title" className="mt-6 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl">
            {overview.producer.fullName}
          </h2>
          <p className="mt-3 text-base font-semibold text-white/85 sm:text-lg">{overview.producer.role}</p>
          <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-white/75 sm:text-xl">{preview.title}</p>
        </header>
      </VelarisBackground>

      <StorySection number="01" title="Issued premium" tone="gold">
        <StoryValue value={money(preview.totalIssuedIpCents)} detail={`${preview.sourceCoverage.reportCount} Gateway reports this month`} />
        <WeeklyStory reports={preview.weeklyReports} />
      </StorySection>

      <StorySection number="02" title="Submitted annual premium" tone="ink">
        <StoryValue value={overview.submittedApCents == null ? "Unavailable" : money(overview.submittedApCents)} detail="Business submitted during this Scorecard period" />
      </StorySection>

      <StorySection number="03" title="Average weekly issued premium" tone="status">
        <StoryValue value={money(preview.averageWeeklyIpCents)} detail={`${headline.label} issuance · ${ISSUANCE_THRESHOLD_SUMMARY}`} valueClass={headline.textClass} />
      </StorySection>

      <ActivityStory activity={overview.activity} />

      <StorySection number="05" title="Month-over-month growth" tone="gold">
        <StoryValue value={growth} detail="Compared with your prior month of personal Gateway issued premium" />
      </StorySection>

      <StorySection number="06" title="Company rank" tone="ink">
        <StoryValue
          value={`#${overview.rank.rank} of ${overview.rank.population}`}
          detail={`${overview.rank.percentile}th percentile · ${overview.rank.movement == null ? "First ranking" : overview.rank.movement === 0 ? "No change" : `${overview.rank.movement > 0 ? "Up" : "Down"} ${Math.abs(overview.rank.movement)} from last month`}`}
        />
      </StorySection>

      <StorySection number="07" title="Tracking consistency" tone="gold">
        <StoryValue
          value={consistency ? `${consistency.percentage}%` : "Schedule needed"}
          detail={consistency ? `${consistency.loggedDays} of ${consistency.expectedDays} expected workdays tracked` : `${overview.activity.trackedDays} tracker submissions · set a schedule to measure consistency`}
        />
      </StorySection>

      <FinalOverview preview={preview} overview={overview} growth={growth} />
    </article>
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

const STORY_TONES = {
  gold: "bg-[#171407] light:bg-[#fff8df]",
  ink: "bg-[#090909] light:bg-white",
  status: "bg-[#120b08] light:bg-[#fff1ef]",
} as const;

function StorySection({
  number,
  title,
  tone,
  children,
}: {
  number: string;
  title: string;
  tone: keyof typeof STORY_TONES;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-h-[58svh] items-center border-t border-white/10 px-6 py-16 light:border-black/10 sm:min-h-[64svh] sm:px-12 lg:px-20 ${STORY_TONES[tone]}`}>
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-baseline gap-4">
          <p className="text-sm font-semibold tabular-nums text-accent">{number}</p>
          <h3 className="text-xl font-semibold tracking-[-0.025em] text-white light:text-ink sm:text-2xl">{title}</h3>
        </div>
        <div className="mt-12 sm:mt-16">{children}</div>
      </div>
    </section>
  );
}

function StoryValue({ value, detail, valueClass = "text-white light:text-ink" }: { value: string; detail: string; valueClass?: string }) {
  return (
    <div className="max-w-3xl">
      <p className={`text-[clamp(3.5rem,10vw,7.5rem)] font-semibold leading-[0.88] tracking-[-0.07em] tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-7 max-w-2xl text-base leading-7 text-white/60 light:text-black/60 sm:text-lg">{detail}</p>
    </div>
  );
}

function WeeklyStory({ reports }: { reports: MonthlyProducerPreview["weeklyReports"] }) {
  if (!reports.length) return <p className="mt-12 text-sm text-white/45 light:text-black/50">Waiting for the first Gateway report.</p>;
  return (
    <div className="mt-14 grid grid-cols-2 gap-x-7 gap-y-6 border-t border-white/15 pt-7 light:border-black/15 sm:grid-cols-5">
      {reports.map((week) => (
        <div key={week.reportDate}>
          <p className="text-sm font-semibold text-white light:text-ink">{money(week.personalIpCents)}</p>
          <p className="mt-1 text-xs text-white/45 light:text-black/50">{longDate(week.reportDate)}</p>
        </div>
      ))}
    </div>
  );
}

function ActivityStory({ activity }: { activity: ProducerOverview["activity"] }) {
  return (
    <section className="flex min-h-[72svh] items-center border-t border-white/10 bg-[#0d1109] px-6 py-16 light:border-black/10 light:bg-[#f3f8ea] sm:px-12 lg:px-20" aria-labelledby="activity-title">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-baseline gap-4">
          <p className="text-sm font-semibold tabular-nums text-accent">04</p>
          <h3 id="activity-title" className="text-xl font-semibold tracking-[-0.025em] text-white light:text-ink sm:text-2xl">Your activity</h3>
        </div>
        {activity.availability !== "tracked" || !activity.totals || !activity.perTrackedDay ? (
          <div className="mt-14 max-w-2xl">
            <p className="text-4xl font-semibold tracking-[-0.045em] text-white light:text-ink sm:text-6xl">{activity.availability === "partial" ? "Activity is incomplete" : "No activity submitted yet"}</p>
            <p className="mt-6 text-base leading-7 text-white/55 light:text-black/60">Missing activity is not counted as zero. Submit complete tracker days to establish an accurate pace.</p>
          </div>
        ) : (
          <>
            <p className="mt-12 text-lg text-white/55 light:text-black/60">Your funnel across {activity.trackedDays} tracked {activity.trackedDays === 1 ? "day" : "days"}</p>
            <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
              {ACTIVITY_LABELS.map(([key, label]) => (
                <div key={key} className="border-t border-white/15 pt-4 light:border-black/15">
                  <p className="text-sm text-white/50 light:text-black/55">{label}</p>
                  <p className="mt-2 text-4xl font-semibold tracking-[-0.05em] text-white tabular-nums light:text-ink sm:text-6xl">{activity.totals![key].toLocaleString()}</p>
                  <p className="mt-2 text-sm text-white/45 light:text-black/50">{activity.perTrackedDay![key].toLocaleString()} per day</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function FinalOverview({ preview, overview, growth }: { preview: MonthlyProducerPreview; overview: ProducerOverview; growth: string }) {
  const consistency = overview.activity.consistency;
  const activitySummary = overview.activity.totals
    ? `${overview.activity.totals.leads} leads · ${overview.activity.totals.dials} dials · ${overview.activity.totals.contacts} contacts · ${overview.activity.totals.appointments} appointments · ${overview.activity.totals.presentations} presentations · ${overview.activity.totals.sales} sales`
    : "Activity unavailable";
  const rows = [
    ["Issued IP", money(preview.totalIssuedIpCents)],
    ["Submitted AP", overview.submittedApCents == null ? "Unavailable" : money(overview.submittedApCents)],
    ["Weekly average", money(preview.averageWeeklyIpCents)],
    ["Activity", activitySummary],
    ["Month-over-month", growth],
    ["Company rank", `#${overview.rank.rank} of ${overview.rank.population}`],
    ["Tracking consistency", consistency ? `${consistency.percentage}%` : "Schedule needed"],
  ];

  return (
    <section className="border-t border-white/10 bg-black px-6 py-16 light:border-black/10 light:bg-[#f6f7f8] sm:px-12 sm:py-20 lg:px-20" aria-labelledby="final-overview-title">
      <div className="mx-auto max-w-4xl">
        <h3 id="final-overview-title" className="text-3xl font-semibold tracking-[-0.04em] text-white light:text-ink sm:text-5xl">Your month, together</h3>
        <dl className="mt-10 divide-y divide-white/12 border-y border-white/12 light:divide-black/12 light:border-black/12">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:items-baseline">
              <dt className="text-sm text-white/45 light:text-black/50">{label}</dt>
              <dd className="text-lg font-semibold leading-7 text-white light:text-ink sm:text-xl">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
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
