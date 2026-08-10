import type {
  IssuanceStatus,
  MonthlyProducerPreview,
  ProducerOverview,
} from "@/lib/scorecards/lifecycle";
import { Avatar } from "@/components/Avatar";
import type { ReactNode } from "react";
import { VelarisBackground } from "./VelarisBackground";

const ISSUANCE_VALUE_CLASS: Record<IssuanceStatus, string> = {
  green: "text-pos",
  blue: "text-[#78a7ff] light:text-[#2859ad]",
  red: "text-neg",
};

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function ProducerScorecardPreview({
  preview,
  overview,
}: {
  preview: MonthlyProducerPreview;
  overview: ProducerOverview;
}) {
  const growth =
    overview.growth.kind === "new_baseline"
      ? "New baseline"
      : `${overview.growth.percentage > 0 ? "+" : ""}${overview.growth.percentage}%`;
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

      <StorySection number="01" title="Issued Premium" compact>
        <StoryValue
          intro="Across all IP reports from Gateway in January, you submitted:"
          introClass="font-normal italic text-white"
          compact
          value={money(preview.totalIssuedIpCents)}
          valueClass={ISSUANCE_VALUE_CLASS[preview.issuanceStatus]}
        />
        <WeeklyTrend reports={preview.weeklyReports} />
        <div className="mt-10 max-w-3xl">
          <p className="text-base font-normal italic text-white sm:text-lg">This means your average weekly IP was:</p>
          <p className="mt-4 text-[clamp(3.5rem,10vw,7.5rem)] font-semibold leading-[0.88] tabular-nums text-ink">
            {money(preview.averageWeeklyIpCents)}
          </p>
        </div>
        <OrganizationComparison
          items={[{
            label: "Issued Premium",
            value: money(preview.totalIssuedIpCents),
            rank: `#${overview.rank.rank} of ${overview.rank.population}`,
          }]}
        />
      </StorySection>

      <ActivityStory activity={overview.activity} submittedApCents={overview.submittedApCents} organizationRanks={overview.organizationRanks} />

      <StorySection number="03" title="Previous Month Growth">
        <MonthOverMonthStory preview={preview} overview={overview} />
      </StorySection>

      <StorySection number="04" title="Tracking Consistency">
        <TrackingConsistencyCalendar preview={preview} activity={overview.activity} />
      </StorySection>

      <FinalOverview preview={preview} overview={overview} growth={growth} />
    </article>
  );
}

function StorySection({
  number,
  title,
  compact = false,
  children,
}: {
  number: string;
  title: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="min-h-[46svh] border-t border-hairline bg-background px-6 py-12 [letter-spacing:0.2px] sm:min-h-[51svh] sm:px-12 sm:py-[3.2rem] lg:px-20">
      <div className="w-full">
        <div className="flex items-baseline gap-5 sm:gap-7">
          <p className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tabular-nums text-accent">{number}</p>
          <h3 className="text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[0.95] text-ink">{title}</h3>
        </div>
        <div className={`${compact ? "mt-8 sm:mt-10" : "mt-10 sm:mt-12"} max-w-4xl`}>{children}</div>
      </div>
    </section>
  );
}

function StoryValue({ value, valueClass = "text-ink", intro, introClass = "text-subtle", compact = false, detail }: { value: string; valueClass?: string; intro?: string; introClass?: string; compact?: boolean; detail?: string }) {
  return (
    <div className="max-w-3xl">
      {intro ? <p className={`max-w-2xl text-base leading-7 sm:text-lg ${introClass}`}>{intro}</p> : null}
      <p className={`${intro ? compact ? "mt-5" : "mt-6" : ""} text-[clamp(3.5rem,10vw,7.5rem)] font-semibold leading-[0.88] tabular-nums ${valueClass}`}>{value}</p>
      {detail ? <p className="mt-5 max-w-2xl text-sm leading-6 text-mute">{detail}</p> : null}
    </div>
  );
}

function WeeklyTrend({ reports }: { reports: MonthlyProducerPreview["weeklyReports"] }) {
  if (!reports.length) return <p className="mt-12 text-sm text-mute">Waiting for the first Gateway report.</p>;
  const values = reports.map((report) => report.personalIpCents);
  const cappedValues = values.map((value) => Math.min(value, 10_000_000));
  const minimum = Math.min(...cappedValues);
  const maximum = Math.max(...cappedValues);
  const range = maximum - minimum;
  const points = values.map((value, index) => {
    const x = reports.length === 1 ? 500 : 105 + (index / (reports.length - 1)) * 825;
    const normalized = range === 0 ? 0.5 : (Math.min(value, 10_000_000) - minimum) / range;
    const y = 180 - normalized * 95;
    return { x, y };
  });
  const linePoints = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const areaPoints = `${linePoints} ${points.at(-1)!.x},195 ${points[0].x},195`;

  return (
    <div className="weekly-trend mt-8 max-w-4xl">
      <style>{`
        .weekly-trend { view-timeline-name: --weekly-trend; view-timeline-axis: block; }
        .weekly-trend__area { animation: weekly-area-in linear both; animation-timeline: --weekly-trend; animation-range: entry 5% cover 32%; }
        .weekly-trend__line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: weekly-line-in linear both; animation-timeline: --weekly-trend; animation-range: entry 10% cover 38%; }
        .weekly-trend__point { opacity: 0; transform-box: fill-box; transform-origin: center; animation: weekly-point-in linear both; animation-timeline: --weekly-trend; animation-range: entry 24% cover 46%; }
        @keyframes weekly-area-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes weekly-line-in { to { stroke-dashoffset: 0; } }
        @keyframes weekly-point-in { from { opacity: 0; transform: translateY(8px) scale(.92); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .weekly-trend__area, .weekly-trend__line, .weekly-trend__point { animation: none; opacity: 1; transform: none; stroke-dashoffset: 0; }
        }
      `}</style>
      <p className="mb-6 text-base font-normal italic text-white sm:text-lg">Here&apos;s what you submitted week by week:</p>
      <svg viewBox="0 0 1000 245" className="h-auto w-full overflow-visible" role="img" aria-label="Weekly issued premium trend by week">
        <defs>
          <linearGradient id="weekly-ip-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        <line x1="98" y1="195" x2="945" y2="195" className="stroke-subtle" strokeWidth="2" />
        <polygon points={areaPoints} fill="url(#weekly-ip-area)" className="weekly-trend__area text-accent" />
        <polyline pathLength="1" points={linePoints} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="weekly-trend__line text-accent" />
        {points.map(({ x, y }, index) => (
          <g key={reports[index].reportDate} className="weekly-trend__point">
            <rect x={Math.max(0, Math.min(860, x - 70))} y={y - 62} width="140" height="43" rx="10" className="fill-card stroke-hairline" />
            <path d={`M ${x - 8} ${y - 19} L ${x} ${y - 10} L ${x + 8} ${y - 19} Z`} className="fill-card stroke-hairline" strokeLinejoin="round" />
            <text x={x} y={y - 35} textAnchor="middle" dominantBaseline="middle" className="fill-ink text-[20px] font-semibold tabular-nums">
              {money(reports[index].personalIpCents)}
            </text>
            <circle cx={x} cy={y} r="6" className="fill-accent" />
          </g>
        ))}
        {points.map(({ x }, index) => (
          <g key={`axis-${reports[index].reportDate}`}>
            <line x1={x} y1="195" x2={x} y2="202" className="stroke-subtle" strokeWidth="2" />
            <text x={x} y="225" textAnchor="middle" className="fill-subtle text-[15px] font-medium">{reports[index].label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function previousMonthLabel(periodStart: string): string {
  const [year, month] = periodStart.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 2, 1)));
}

function calendarDates(periodStart: string, periodEnd: string): Array<string | null> {
  const first = new Date(`${periodStart}T00:00:00Z`);
  const last = new Date(`${periodEnd}T00:00:00Z`);
  const dates: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null);

  for (const date = new Date(first); date <= last; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
}

function TrackingConsistencyCalendar({
  preview,
  activity,
}: {
  preview: MonthlyProducerPreview;
  activity: ProducerOverview["activity"];
}) {
  const consistency = activity.consistency;
  if (!consistency || !activity.expectedDates) {
    return (
      <StoryValue
        value="Schedule Needed"
        detail={`${activity.trackedDays} tracker submissions · set a schedule to measure consistency`}
      />
    );
  }

  const loggedDates = new Set(activity.loggedDates);
  const expectedDates = new Set(activity.expectedDates);
  const dates = calendarDates(preview.periodStart, preview.periodEnd);
  const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <div className="max-w-4xl">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[clamp(3rem,8vw,6rem)] font-semibold leading-none tabular-nums text-ink">{consistency.percentage}%</p>
          <p className="mt-3 text-base text-subtle sm:text-lg">{consistency.loggedDays} of {consistency.expectedDays} expected workdays logged</p>
        </div>
        <div className="flex gap-5 text-sm text-subtle" aria-label="Calendar status legend">
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-pos" aria-hidden="true" />Logged</span>
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-neg" aria-hidden="true" />Did Not Log</span>
        </div>
      </div>

      <div className="mt-8 border border-hairline" aria-label={`${preview.periodLabel} tracking calendar`}>
        <div className="grid grid-cols-7 border-b border-hairline text-center text-xs font-medium text-subtle sm:text-sm">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <p key={day} className="py-3">{day}</p>)}
        </div>
        <div className="grid grid-cols-7">
          {dates.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} className="min-h-16 border-b border-r border-hairline bg-card/30 sm:min-h-20" aria-hidden="true" />;
            const logged = loggedDates.has(date);
            const missed = expectedDates.has(date) && !logged;
            const status = logged ? "Logged" : missed ? "Did Not Log" : "Not Scheduled";
            return (
              <div
                key={date}
                aria-label={`${dayFormatter.format(new Date(`${date}T00:00:00Z`))}: ${status}`}
                className="flex min-h-16 flex-col items-center border-b border-r border-hairline p-2 text-center last:border-r-0 sm:min-h-20 sm:p-3"
              >
                <p className="text-sm font-medium tabular-nums text-ink">{Number(date.slice(-2))}</p>
                {(logged || missed) && <span className={`mt-3 block h-2.5 w-2.5 rounded-full ${logged ? "bg-pos" : "bg-neg"}`} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthOverMonthStory({
  preview,
  overview,
}: {
  preview: MonthlyProducerPreview;
  overview: ProducerOverview;
}) {
  const percentageChange = (previous: number | null, current: number | null) => {
    if (previous == null || current == null) return "Unavailable";
    if (previous === 0) return "New Baseline";
    const percentage = Math.round(((current - previous) / previous) * 1_000) / 10;
    return `${percentage > 0 ? "+" : ""}${percentage}%`;
  };
  const formatCount = (value: number | null) => value == null ? "Unavailable" : value.toLocaleString();
  const previousActivity = overview.priorActivityTotals;
  const currentActivity = overview.activity.totals;
  const comparisons = [
    { label: "Issued Premium", previous: overview.priorIssuedIpCents, current: preview.totalIssuedIpCents, format: (value: number | null) => value == null ? "Unavailable" : money(value) },
    { label: "Submitted AP", previous: overview.priorSubmittedApCents, current: overview.submittedApCents, format: (value: number | null) => value == null ? "Unavailable" : money(value) },
    { label: "Dials", previous: previousActivity?.dials ?? null, current: currentActivity?.dials ?? null, format: formatCount },
    { label: "Contacts", previous: previousActivity?.contacts ?? null, current: currentActivity?.contacts ?? null, format: formatCount },
    { label: "Appointments", previous: previousActivity?.appointments ?? null, current: currentActivity?.appointments ?? null, format: formatCount },
    { label: "Presentations", previous: previousActivity?.presentations ?? null, current: currentActivity?.presentations ?? null, format: formatCount },
    { label: "Sales", previous: previousActivity?.sales ?? null, current: currentActivity?.sales ?? null, format: formatCount },
  ];
  const previousLabel = previousMonthLabel(preview.periodStart);

  return (
    <div className="max-w-5xl border border-hairline">
      <div className="grid grid-cols-[3fr_3fr_2fr] border-b border-hairline text-sm font-medium text-subtle sm:text-base">
        <p className="px-3 py-4 sm:px-6">{previousLabel}</p>
        <p className="border-l border-hairline px-3 py-4 sm:px-6">{preview.periodLabel}</p>
        <p className="border-l border-hairline px-3 py-4 text-right sm:px-6">Percent Change</p>
      </div>
      {comparisons.map((comparison) => (
        <div key={comparison.label} className="grid grid-cols-[3fr_3fr_2fr] border-b border-hairline last:border-b-0">
          <p className="px-3 py-5 sm:px-6">
            <span className="block text-sm font-medium text-subtle sm:text-base">{comparison.label}</span>
            <span className="mt-2 block text-xl font-semibold tabular-nums text-ink sm:text-3xl">{comparison.format(comparison.previous)}</span>
          </p>
          <p className="border-l border-hairline px-3 py-5 sm:px-6">
            <span className="block text-sm font-medium text-subtle sm:text-base">{comparison.label}</span>
            <span className="mt-2 block text-xl font-semibold tabular-nums text-ink sm:text-3xl">{comparison.format(comparison.current)}</span>
          </p>
          <p className="border-l border-hairline px-3 pb-5 pt-12 text-right text-xl font-semibold tabular-nums text-accent sm:px-6 sm:text-3xl">
            {percentageChange(comparison.previous, comparison.current)}
          </p>
        </div>
      ))}
    </div>
  );
}

type ComparisonItem = {
  label: string;
  value: string;
  rank: string;
};

function OrganizationComparison({ items }: { items: ComparisonItem[] }) {
  return (
    <div className="mt-10 max-w-5xl">
      <p className="text-base font-normal italic text-white sm:text-lg">Here&apos;s how you matched up against the organization:</p>
      <div className={`mt-5 grid gap-3 ${items.length === 1 ? "max-w-sm" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-hairline bg-card px-5 py-4">
            <p className="text-sm text-subtle">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{item.value}</p>
            <p className="mt-3 text-sm font-medium text-accent">{item.rank}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityStory({ activity, submittedApCents, organizationRanks }: { activity: ProducerOverview["activity"]; submittedApCents: number | null; organizationRanks: ProducerOverview["organizationRanks"] }) {
  return (
    <section className="min-h-[58svh] border-t border-hairline bg-background px-6 py-12 [letter-spacing:0.2px] sm:px-12 sm:py-[3.2rem] lg:px-20" aria-labelledby="activity-title">
      <div className="w-full">
        <div className="flex items-baseline gap-5 sm:gap-7">
          <p className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tabular-nums text-accent">02</p>
          <h3 id="activity-title" className="text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[0.95] text-ink">Your Activity</h3>
        </div>
        <div className="mt-10 max-w-4xl">
          <p className="text-base font-normal italic text-white sm:text-lg">Inside the OS Tracker, you submitted:</p>
          <p className="mt-5 text-[clamp(3.5rem,10vw,7.5rem)] font-semibold leading-[0.88] tabular-nums text-ink">
            {submittedApCents == null ? "Unavailable" : money(submittedApCents)}
          </p>
        </div>
        {activity.availability !== "tracked" || !activity.totals ? (
          <div className="mt-10 max-w-2xl">
            <p className="text-3xl font-semibold text-ink sm:text-5xl">{activity.availability === "partial" ? "Activity is incomplete" : "No activity submitted yet"}</p>
            <p className="mt-5 text-base leading-7 text-subtle">Missing activity is not counted as zero. Submit complete tracker days to establish an accurate pace.</p>
          </div>
        ) : (
          <>
            <div className="mt-10 max-w-5xl space-y-1 text-lg italic leading-8 text-white sm:text-xl sm:leading-9">
              <p>You logged <strong className="font-semibold text-accent">{activity.totals.dials.toLocaleString()} dials</strong>.</p>
              <p>You spoke with <strong className="font-semibold text-accent">{activity.totals.contacts.toLocaleString()} people</strong>.</p>
              <p>You booked <strong className="font-semibold text-accent">{activity.totals.appointments.toLocaleString()} appointments</strong>.</p>
              <p>You ran <strong className="font-semibold text-accent">{activity.totals.presentations.toLocaleString()} presentations</strong>.</p>
              <p>You submitted <strong className="font-semibold text-accent">{activity.totals.sales.toLocaleString()} sales</strong>.</p>
            </div>
            <OrganizationComparison
              items={[
                { label: "Submitted AP", value: submittedApCents == null ? "Unavailable" : money(submittedApCents), rank: `#${organizationRanks.submittedAp.rank} of ${organizationRanks.submittedAp.population}` },
                { label: "Dials", value: activity.totals.dials.toLocaleString(), rank: `#${organizationRanks.dials.rank} of ${organizationRanks.dials.population}` },
                { label: "Contacts", value: activity.totals.contacts.toLocaleString(), rank: `#${organizationRanks.contacts.rank} of ${organizationRanks.contacts.population}` },
                { label: "Appointments", value: activity.totals.appointments.toLocaleString(), rank: `#${organizationRanks.appointments.rank} of ${organizationRanks.appointments.population}` },
                { label: "Presentations", value: activity.totals.presentations.toLocaleString(), rank: `#${organizationRanks.presentations.rank} of ${organizationRanks.presentations.population}` },
                { label: "Sales", value: activity.totals.sales.toLocaleString(), rank: `#${organizationRanks.sales.rank} of ${organizationRanks.sales.population}` },
              ]}
            />
          </>
        )}
      </div>
    </section>
  );
}

function FinalOverview({ preview, overview, growth }: { preview: MonthlyProducerPreview; overview: ProducerOverview; growth: string }) {
  const consistency = overview.activity.consistency;
  const activitySummary = overview.activity.totals
    ? `${overview.activity.totals.dials} dials · ${overview.activity.totals.contacts} contacts · ${overview.activity.totals.appointments} appointments · ${overview.activity.totals.presentations} presentations · ${overview.activity.totals.sales} sales`
    : "Activity unavailable";
  const rows = [
    ["Issued IP", money(preview.totalIssuedIpCents)],
    ["Submitted AP", overview.submittedApCents == null ? "Unavailable" : money(overview.submittedApCents)],
    ["Weekly Average", money(preview.averageWeeklyIpCents)],
    ["Activity", activitySummary],
    ["Month-over-Month", growth],
    ["Company Rank", `#${overview.rank.rank} of ${overview.rank.population}`],
    ["Tracking Consistency", consistency ? `${consistency.percentage}%` : "Schedule needed"],
  ];

  return (
    <section className="border-t border-hairline bg-background px-6 py-16 [letter-spacing:0.2px] sm:px-12 sm:py-20 lg:px-20" aria-labelledby="final-overview-title">
      <div className="mx-auto max-w-4xl">
        <h3 id="final-overview-title" className="text-3xl font-semibold text-ink sm:text-5xl">Your month, together</h3>
        <dl className="mt-10 divide-y divide-hairline border-y border-hairline">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:items-baseline">
              <dt className="text-sm text-mute">{label}</dt>
              <dd className="text-lg font-semibold leading-7 text-ink sm:text-xl">{value}</dd>
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
      <ProducerScorecardPreview preview={preview} overview={overview} />
    </main>
  );
}
