import type {
  IssuanceStatus,
  MonthlyProducerPreview,
  ProducerOverview,
} from "@/lib/scorecards/lifecycle";
import { weeklyShares } from "@/lib/scorecards/weekly-trend";
import Image from "next/image";
import { Avatar } from "@/components/Avatar";
import type { ReactNode } from "react";
import {
  createProducerStarSummary,
  producerMetricStars,
  type ProducerStarSummary,
  type StarRating,
} from "@/lib/scorecards/ratings";
import { VelarisBackground } from "./VelarisBackground";
import { ScorecardExportControls } from "./ScorecardExportControls";
import { ProducerBaseballCard } from "./ProducerBaseballCard";

const ISSUANCE_VALUE_CLASS: Record<IssuanceStatus, string> = {
  green: "text-pos",
  blue: "text-[#78a7ff] light:text-[#2859ad]",
  red: "text-neg",
};

export function money(cents: number): string {
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
  const starSummary = producerStarSummary(preview, overview);
  const ratings = producerRatings(preview, overview);
  const exportMetadata = {
    cardType: "producer" as const,
    memberName: overview.producer.fullName,
    periodLabel: preview.periodLabel,
  };
  return (
    <article aria-labelledby="producer-scorecard-title" className="overflow-hidden rounded-[1.4rem] border border-hairline bg-card">
      <ScorecardHeader
        titleId="producer-scorecard-title"
        memberName={overview.producer.fullName}
        photoUrl={overview.producer.photoUrl}
        title={preview.title}
        averageStars={starSummary?.average ?? null}
        totalStars={starSummary?.total ?? null}
      />

      <ScorecardHowItWorks />

      <StorySection number="01" title="Issued Premium" compact sectionId="scorecard-section-01" exportName="01 Issued Premium" exportMetadata={exportMetadata}>
        <StoryValue
          intro={`Across all IP reports from Gateway in ${preview.periodLabel.split(" ")[0]}, you submitted:`}
          introClass="font-normal italic text-white"
          compact
          value={money(preview.totalIssuedIpCents)}
          valueClass={ISSUANCE_VALUE_CLASS[preview.issuanceStatus]}
          rating={{ value: ratings.issuedIp, label: "Issued Premium" }}
        />
        <WeeklyTrend reports={preview.weeklyReports} />
        <div className="mt-10 max-w-3xl">
          <p className="scorecard-copy text-base font-normal italic text-white sm:text-lg">This means your average weekly IP was:</p>
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

      <ActivityStory activity={overview.activity} submittedApCents={overview.submittedApCents} organizationRanks={overview.organizationRanks} ratings={ratings} exportMetadata={exportMetadata} />

      <StorySection number="03" title="Previous Month Growth" sectionId="scorecard-section-03" exportName="03 Previous Month Growth" exportMetadata={exportMetadata}>
        <MonthOverMonthStory preview={preview} overview={overview} />
      </StorySection>

      <StorySection number="04" title="Tracking Consistency" sectionId="scorecard-section-04" exportName="04 Tracking Consistency" exportMetadata={exportMetadata}>
        <TrackingConsistencyCalendar preview={preview} activity={overview.activity} rating={ratings.trackingConsistency} />
      </StorySection>

      <StorySection number="05" title="Your Scorecard" centerContent sectionId="scorecard-section-05" exportName="05 Your Scorecard" exportMetadata={exportMetadata}>
        <ProducerBaseballCard
          memberName={overview.producer.fullName}
          photoUrl={overview.producer.photoUrl}
          periodLabel={preview.periodLabel}
          averageRating={starSummary?.average ?? null}
          totalRating={starSummary?.total ?? null}
          ratings={[
            { label: "Issued Premium", value: ratings.issuedIp },
            { label: "Submitted AP", value: ratings.submittedAp },
            { label: "Lead Spend", value: ratings.leadSpend },
            { label: "Dials", value: ratings.dials },
            { label: "Contacts", value: ratings.contacts },
            { label: "Presentations", value: ratings.presentations },
            { label: "Submitted Sales", value: ratings.sales },
            { label: "Tracking", value: ratings.trackingConsistency },
          ]}
        />
      </StorySection>

    </article>
  );
}

const PRODUCER_SCORECARD_AREAS = [
  "IP",
  "Dials",
  "Presentations",
  "Lead Spend",
  "AP",
  "Contacts",
  "Sales",
  "Tracking",
] as const;

const PRODUCER_SCORECARD_LEVELS = [
  { stars: "0 stars", description: "No recorded performance" },
  { stars: "1 star", description: "Bottom 20% of producers" },
  { stars: "2 stars", description: "21st–40th percentile" },
  { stars: "3 stars", description: "41st–60th percentile" },
  { stars: "4 stars", description: "61st–80th percentile" },
  { stars: "5 stars", description: "Top 20% of producers" },
] as const;

function ScorecardHowItWorks() {
  return (
    <section
      id="scorecard-how-it-works"
      aria-labelledby="scorecard-how-it-works-title"
      className="relative border-t border-hairline bg-background px-6 py-12 [letter-spacing:0.2px] sm:px-12 sm:py-[3.2rem] lg:px-20"
    >
      <details open className="group">
        <summary
          aria-label="Toggle How Scorecards Work"
          aria-controls="scorecard-how-it-works-content"
          className="flex cursor-pointer list-none items-center justify-between gap-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden"
        >
          <h3
            id="scorecard-how-it-works-title"
            className="max-w-4xl text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[0.95] text-ink"
          >
            How Scorecards Work
          </h3>
          <span aria-hidden="true" className="shrink-0 text-[clamp(2.5rem,5vw,4rem)] font-light leading-none text-accent group-open:rotate-90">&gt;</span>
        </summary>

        <div id="scorecard-how-it-works-content" className="w-full">
          <p className="scorecard-copy mt-9 max-w-4xl text-base leading-7 text-white sm:text-lg sm:leading-8">
            As a producer, we create a scorecard for you based on eight areas the OS helps you track:
          </p>

          <ul aria-label="Eight Producer scorecard areas" className="mt-7 grid grid-cols-4 gap-2 sm:gap-3">
            {PRODUCER_SCORECARD_AREAS.map((area) => (
              <li
                key={area}
                className="flex min-h-20 items-center justify-center rounded-xl border border-hairline bg-card px-2 py-5 text-center text-[clamp(0.7rem,2vw,1.25rem)] font-semibold leading-tight text-ink sm:min-h-24 sm:px-4"
              >
                {area}
              </li>
            ))}
          </ul>

          <div className="mt-9 max-w-4xl text-base leading-7 text-subtle sm:text-lg sm:leading-8">
            <p>We then rank your performance in all 8 areas against the entire organization and average out your rankings to give you an overall score:</p>

            <dl className="mt-6 border-y border-hairline">
              {PRODUCER_SCORECARD_LEVELS.map((level) => (
                <div key={level.stars} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 border-b border-hairline py-3.5 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)]">
                  <dt className="font-semibold text-accent">{level.stars}</dt>
                  <dd>{level.description}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-6">You can download 9:16 or 16:9 screenshots of each section to post online along with your scorecard.</p>
            <p className="mt-6 font-semibold text-white">
              If you are not proud to post your numbers online, chances are you should get to work. Numbers don&apos;t lie. If you don&apos;t like your ranking, do something about it.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

type ProducerRatings = {
  issuedIp: StarRating;
  submittedAp: StarRating | null;
  leadSpend: StarRating;
  dials: StarRating | null;
  contacts: StarRating | null;
  presentations: StarRating | null;
  sales: StarRating | null;
  trackingConsistency: StarRating | null;
};

function producerRatings(
  preview: MonthlyProducerPreview,
  overview: ProducerOverview,
): ProducerRatings {
  const totals = overview.activity.totals;
  return {
    issuedIp: producerMetricStars("issuedIpCents", preview.totalIssuedIpCents),
    submittedAp: overview.submittedApCents == null
      ? null
      : producerMetricStars("submittedApCents", overview.submittedApCents),
    leadSpend: producerMetricStars("leadSpendCents", overview.activity.leadSpendCents),
    dials: totals ? producerMetricStars("dials", totals.dials) : null,
    contacts: totals ? producerMetricStars("contacts", totals.contacts) : null,
    presentations: totals ? producerMetricStars("presentations", totals.presentations) : null,
    sales: totals ? producerMetricStars("sales", totals.sales) : null,
    trackingConsistency: overview.activity.consistency
      ? producerMetricStars("trackingConsistency", overview.activity.consistency.percentage)
      : null,
  };
}

function producerStarSummary(
  preview: MonthlyProducerPreview,
  overview: ProducerOverview,
): ProducerStarSummary | null {
  const totals = overview.activity.totals;
  const consistency = overview.activity.consistency;
  if (overview.submittedApCents == null || !totals || !consistency) return null;
  return createProducerStarSummary({
    issuedIpCents: preview.totalIssuedIpCents,
    submittedApCents: overview.submittedApCents,
    leadSpendCents: overview.activity.leadSpendCents,
    dials: totals.dials,
    contacts: totals.contacts,
    presentations: totals.presentations,
    sales: totals.sales,
    trackingConsistency: consistency.percentage,
  });
}

function StarScale({
  value,
  label,
  prominent = false,
}: {
  value: number;
  label: string;
  prominent?: boolean;
}) {
  const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return (
    <span
      data-export-exclude=""
      className={`inline-flex items-center gap-1 leading-none ${prominent ? "text-2xl sm:text-3xl" : "text-lg"}`}
      aria-label={`${label}: ${displayValue} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(1, value - index));
        return (
          <span key={index} className="relative inline-block text-white/15" aria-hidden="true">
            ★
            <span className="absolute inset-y-0 left-0 overflow-hidden text-accent" style={{ width: `${fill * 100}%` }}>★</span>
          </span>
        );
      })}
    </span>
  );
}

export function ScorecardHeader({
  titleId,
  memberName,
  photoUrl,
  title,
  averageStars,
  totalStars,
}: {
  titleId: string;
  memberName: string;
  photoUrl: string | null;
  title: string;
  averageStars?: number | null;
  totalStars?: number | null;
}) {
  return (
    <VelarisBackground>
      <header className="border-b border-white/10 px-5 pb-7 pt-8 text-center sm:px-7 sm:pb-8 sm:pt-10">
        <Image
          src="/logo.png"
          alt="All Star"
          width={160}
          height={90}
          priority
          className="mx-auto mb-6 h-10 w-auto opacity-90 sm:h-12"
        />
        <Avatar
          name={memberName}
          photoUrl={photoUrl}
          className="mx-auto h-24 w-24 text-2xl ring-4 ring-black/70 outline outline-1 outline-offset-4 outline-white/25 sm:h-28 sm:w-28"
        />
        <h2 id={titleId} className="mt-6 text-lg font-semibold tracking-[-0.035em] text-white sm:text-[1.40625rem]">
          {memberName}
        </h2>
        <p className="mt-3 text-[1.5625rem] font-semibold tracking-[-0.025em] text-white/85 sm:text-3xl">{title}</p>
        {averageStars != null && totalStars != null ? (
          <div className="mt-5 flex flex-col items-center gap-2">
            <StarScale value={averageStars} label="Average rating" prominent />
            <p className="text-sm font-medium tabular-nums text-white/65">
              {averageStars.toFixed(1)} average · {totalStars} of 40 total stars
            </p>
          </div>
        ) : null}
      </header>
    </VelarisBackground>
  );
}

export function StorySection({
  number,
  title,
  compact = false,
  condensed = false,
  centerContent = false,
  sectionId,
  exportName,
  exportMetadata,
  children,
}: {
  number: string;
  title: string;
  compact?: boolean;
  condensed?: boolean;
  centerContent?: boolean;
  sectionId: string;
  exportName: string;
  exportMetadata: { cardType: "producer" | "builder"; memberName: string; periodLabel: string };
  children: ReactNode;
}) {
  return (
    <section
      id={sectionId}
      className={`relative border-t border-hairline bg-background px-6 [letter-spacing:0.2px] sm:px-12 lg:px-20 ${condensed ? "py-10 sm:py-12" : "min-h-[46svh] py-12 sm:min-h-[51svh] sm:py-[3.2rem]"}`}
    >
      <ScorecardExportControls sectionId={sectionId} sectionName={exportName} {...exportMetadata} />
      <div className="w-full">
        <div className="flex items-baseline gap-5 sm:gap-7">
          <p className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tabular-nums text-accent">{number}</p>
          <h3 className="text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[0.95] text-ink">{title}</h3>
        </div>
        <div className={`${compact ? "mt-8 sm:mt-10" : "mt-10 sm:mt-12"} max-w-4xl ${centerContent ? "mx-auto" : ""}`}>{children}</div>
      </div>
    </section>
  );
}

export function StoryValue({ value, valueClass = "text-ink", intro, introClass = "text-subtle", compact = false, detail, rating }: { value: string; valueClass?: string; intro?: string; introClass?: string; compact?: boolean; detail?: string; rating?: { value: StarRating; label: string } }) {
  return (
    <div className="max-w-3xl">
      {intro ? <p className={`scorecard-copy scorecard-intro max-w-2xl text-base leading-7 sm:text-lg ${introClass}`}>{intro}</p> : null}
      <div className={`${intro ? compact ? "mt-5" : "mt-6" : ""} flex flex-wrap items-end gap-x-5 gap-y-3`}>
        <p className={`text-[clamp(3.5rem,10vw,7.5rem)] font-semibold leading-[0.88] tabular-nums ${valueClass}`}>{value}</p>
        {rating ? <span className="pb-1 sm:pb-2"><StarScale value={rating.value} label={rating.label} /></span> : null}
      </div>
      {detail ? <p className="mt-5 max-w-2xl text-sm leading-6 text-mute">{detail}</p> : null}
    </div>
  );
}

function WeeklyTrend({ reports }: { reports: MonthlyProducerPreview["weeklyReports"] }) {
  if (!reports.length) return <p className="mt-12 text-sm text-mute">Waiting for the first Gateway report.</p>;
  const shares = weeklyShares(reports.map((report) => report.personalIpCents));

  return (
    <div className="weekly-trend mt-8 max-w-4xl">
      <p className="scorecard-copy mb-6 text-base font-normal italic text-white sm:text-lg">Here&apos;s what you submitted week by week:</p>
      <div className="weekly-trend__bars space-y-4 md:space-y-5" role="img" aria-label="Weekly issued premium by week">
        {reports.map((report, index) => {
          return (
            <div key={report.reportDate} className="weekly-trend__bar-row grid grid-cols-[5.25rem_minmax(0,1fr)_4.5rem] items-center gap-3 md:grid-cols-[8rem_minmax(0,1fr)_6.5rem] md:gap-5">
              <span className="weekly-trend__bar-label text-xs font-medium text-subtle md:text-sm lg:text-base">{report.label}</span>
              <span className="weekly-trend__bar-track relative h-3 overflow-hidden rounded-sm bg-card md:h-4">
                <span
                  className="weekly-trend__bar-fill block h-full origin-left rounded-sm bg-accent"
                  style={{ width: `${shares[index]}%` }}
                />
              </span>
              <span className="weekly-trend__bar-value text-left text-sm font-semibold text-ink tabular-nums md:text-base lg:text-lg">{money(report.personalIpCents)}</span>
            </div>
          );
        })}
      </div>
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
  rating,
}: {
  preview: MonthlyProducerPreview;
  activity: ProducerOverview["activity"];
  rating: StarRating | null;
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
    <div className="tracking-story max-w-4xl">
      <div className="tracking-head flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <p className="text-[clamp(3rem,8vw,6rem)] font-semibold leading-none tabular-nums text-ink">{consistency.percentage}%</p>
            {rating != null ? <span className="pb-1"><StarScale value={rating} label="Tracking Consistency" /></span> : null}
          </div>
          <p className="tracking-summary mt-3 text-base text-subtle sm:text-lg">{consistency.loggedDays} of {consistency.expectedDays} expected workdays logged</p>
        </div>
        <div className="tracking-legend flex gap-5 text-sm text-subtle" aria-label="Calendar status legend">
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
    { label: "Presentations", previous: previousActivity?.presentations ?? null, current: currentActivity?.presentations ?? null, format: formatCount },
    { label: "Sales", previous: previousActivity?.sales ?? null, current: currentActivity?.sales ?? null, format: formatCount },
  ];
  const previousLabel = previousMonthLabel(preview.periodStart);

  return (
    <div className="growth-table max-w-5xl border border-hairline">
      <div className="grid grid-cols-[3fr_3fr_2fr] border-b border-hairline text-sm font-medium text-subtle sm:text-base">
        <p className="growth-header-cell px-3 py-4 sm:px-6">{previousLabel}</p>
        <p className="growth-header-cell border-l border-hairline px-3 py-4 sm:px-6">{preview.periodLabel}</p>
        <p className="growth-header-cell border-l border-hairline px-3 py-4 text-right sm:px-6">Percent Change</p>
      </div>
      {comparisons.map((comparison) => (
        <div key={comparison.label} className="growth-row grid grid-cols-[3fr_3fr_2fr] border-b border-hairline last:border-b-0">
          <p className="growth-cell px-3 py-5 sm:px-6">
            <span className="growth-title block text-sm font-medium text-subtle sm:text-base">{comparison.label}</span>
            <span className="growth-value mt-2 block text-xl font-semibold tabular-nums text-ink sm:text-3xl">{comparison.format(comparison.previous)}</span>
          </p>
          <p className="growth-cell border-l border-hairline px-3 py-5 sm:px-6">
            <span className="growth-title block text-sm font-medium text-subtle sm:text-base">{comparison.label}</span>
            <span className="growth-value mt-2 block text-xl font-semibold tabular-nums text-ink sm:text-3xl">{comparison.format(comparison.current)}</span>
          </p>
          <p className="growth-cell growth-value border-l border-hairline px-3 pb-5 pt-12 text-right text-xl font-semibold tabular-nums text-accent sm:px-6 sm:text-3xl">
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
  stars?: StarRating;
};

export function OrganizationComparison({ items }: { items: ComparisonItem[] }) {
  const rankOnly = items.length === 1;

  return (
    <div className="mt-10 max-w-5xl">
      <p className="scorecard-copy text-base font-normal italic text-white sm:text-lg">Here&apos;s how you matched up against the organization:</p>
      <div className={`organization-grid mt-5 grid gap-3 ${rankOnly ? "w-fit max-w-full" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {items.map((item) => (
          <div key={item.label} className={`organization-card rounded-xl border border-hairline bg-card ${rankOnly ? "w-fit px-4 py-4 sm:px-5 sm:py-5" : "px-5 py-4"}`}>
            {rankOnly ? (
              <p className="whitespace-nowrap text-3xl font-semibold leading-none tabular-nums text-accent sm:text-4xl">{item.rank}</p>
            ) : (
              <>
                <p className="organization-card-label text-sm text-subtle">{item.label}</p>
                <p className="organization-card-value mt-2 text-2xl font-semibold tabular-nums text-ink">{item.value}</p>
                {item.stars != null ? <p className="mt-3"><StarScale value={item.stars} label={item.label} /></p> : null}
                <p className="organization-card-rank mt-3 text-sm font-medium text-accent">{item.rank}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityStory({ activity, submittedApCents, organizationRanks, ratings, exportMetadata }: { activity: ProducerOverview["activity"]; submittedApCents: number | null; organizationRanks: ProducerOverview["organizationRanks"]; ratings: ProducerRatings; exportMetadata: { cardType: "producer"; memberName: string; periodLabel: string } }) {
  return (
    <section id="scorecard-section-02" className="relative min-h-[58svh] border-t border-hairline bg-background px-6 py-12 [letter-spacing:0.2px] sm:px-12 sm:py-[3.2rem] lg:px-20" aria-labelledby="activity-title">
      <ScorecardExportControls sectionId="scorecard-section-02" sectionName="02 Your Activity" {...exportMetadata} />
      <div className="w-full">
        <div className="flex items-baseline gap-5 sm:gap-7">
          <p className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tabular-nums text-accent">02</p>
          <h3 id="activity-title" className="text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[0.95] text-ink">Your Activity</h3>
        </div>
        <div className="mt-10 max-w-4xl">
          <p className="scorecard-copy text-base font-normal italic text-white sm:text-lg">In July you submitted:</p>
          <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-3">
            <p className="text-[clamp(3.5rem,10vw,7.5rem)] font-semibold leading-[0.88] tabular-nums text-ink">
              {submittedApCents == null ? "Unavailable" : money(submittedApCents)}
            </p>
            {ratings.submittedAp != null ? <span className="pb-1 sm:pb-2"><StarScale value={ratings.submittedAp} label="Submitted AP" /></span> : null}
          </div>
        </div>
        {activity.availability !== "tracked" || !activity.totals ? (
          <div className="mt-10 max-w-2xl">
            <p className="text-3xl font-semibold text-ink sm:text-5xl">{activity.availability === "partial" ? "Activity is incomplete" : "No activity submitted yet"}</p>
            <p className="mt-5 text-base leading-7 text-subtle">Missing activity is not counted as zero. Submit complete tracker days to establish an accurate pace.</p>
          </div>
        ) : (
          <>
            <div className="activity-story-lines mt-10 max-w-5xl space-y-1 text-lg italic leading-8 text-white sm:text-xl sm:leading-9">
              <ActivityRatingLine label="Dials" rating={ratings.dials}><span>You logged <strong className="font-semibold text-accent">{activity.totals.dials.toLocaleString()} dials</strong>.</span></ActivityRatingLine>
              <ActivityRatingLine label="Contacts" rating={ratings.contacts}><span>You spoke with <strong className="font-semibold text-accent">{activity.totals.contacts.toLocaleString()} people</strong>.</span></ActivityRatingLine>
              <ActivityRatingLine label="Presentations" rating={ratings.presentations}><span>You ran <strong className="font-semibold text-accent">{activity.totals.presentations.toLocaleString()} presentations</strong>.</span></ActivityRatingLine>
              <ActivityRatingLine label="Submitted Sales" rating={ratings.sales}><span>You submitted <strong className="font-semibold text-accent">{activity.totals.sales.toLocaleString()} sales</strong>.</span></ActivityRatingLine>
              <ActivityRatingLine label="Lead Spend" rating={ratings.leadSpend}><span>You spent <strong className="font-semibold text-accent">{money(activity.leadSpendCents)} on leads</strong>.</span></ActivityRatingLine>
            </div>
            <OrganizationComparison
              items={[
                { label: "Submitted AP", value: submittedApCents == null ? "Unavailable" : money(submittedApCents), rank: `#${organizationRanks.submittedAp.rank} of ${organizationRanks.submittedAp.population}`, stars: ratings.submittedAp ?? undefined },
                { label: "Lead Spend", value: money(activity.leadSpendCents), rank: `#${organizationRanks.leadSpend.rank} of ${organizationRanks.leadSpend.population}`, stars: ratings.leadSpend ?? undefined },
                { label: "Dials", value: activity.totals.dials.toLocaleString(), rank: `#${organizationRanks.dials.rank} of ${organizationRanks.dials.population}`, stars: ratings.dials ?? undefined },
                { label: "Contacts", value: activity.totals.contacts.toLocaleString(), rank: `#${organizationRanks.contacts.rank} of ${organizationRanks.contacts.population}`, stars: ratings.contacts ?? undefined },
                { label: "Presentations", value: activity.totals.presentations.toLocaleString(), rank: `#${organizationRanks.presentations.rank} of ${organizationRanks.presentations.population}`, stars: ratings.presentations ?? undefined },
                { label: "Submitted Sales", value: activity.totals.sales.toLocaleString(), rank: `#${organizationRanks.sales.rank} of ${organizationRanks.sales.population}`, stars: ratings.sales ?? undefined },
              ]}
            />
          </>
        )}
      </div>
    </section>
  );
}

function ActivityRatingLine({ label, rating, children }: { label: string; rating: StarRating | null; children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {children}
      {rating != null ? <StarScale value={rating} label={label} /> : null}
    </p>
  );
}

export function ScorecardsPageShell({ preview, overview }: { preview: MonthlyProducerPreview; overview: ProducerOverview }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <ProducerScorecardPreview preview={preview} overview={overview} />
    </main>
  );
}
