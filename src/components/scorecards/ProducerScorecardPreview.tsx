import type {
  MonthlyProducerPreview,
  ProducerOverview,
} from "@/lib/scorecards/lifecycle";
import Image from "next/image";
import { Avatar } from "@/components/Avatar";
import type { ReactNode } from "react";
import {
  createProducerStarSummary,
  producerRankStars,
  type ProducerStarSummary,
  type StarRating,
} from "@/lib/scorecards/ratings";
import { VelarisBackground } from "./VelarisBackground";
import { ScorecardExportControls } from "./ScorecardExportControls";
import { ProducerBaseballCard } from "./ProducerBaseballCard";

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
  const ratings = producerRatings(preview, overview);
  const starSummary = producerStarSummary(ratings);
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

      <StorySection number={null} title="Your Numbers" collapsible sectionId="scorecard-section-01" exportName="Your Numbers" exportMetadata={exportMetadata}>
        <ProducerNumbersGrid preview={preview} overview={overview} ratings={ratings} />
      </StorySection>

      <StorySection number={null} title="Your Tracking" collapsible sectionId="scorecard-section-02" exportName="Your Tracking" exportMetadata={exportMetadata}>
        <TrackingConsistencyCalendar preview={preview} activity={overview.activity} rating={ratings.trackingConsistency} />
      </StorySection>

      <StorySection number={null} title="Previous Month Growth" collapsible sectionId="scorecard-section-03" exportName="Previous Month Growth" exportMetadata={exportMetadata}>
        <MonthOverMonthStory preview={preview} overview={overview} />
      </StorySection>

      <StorySection number={null} title="Your Scorecard" centerContent centerHeading sectionId="scorecard-section-card" exportName="Your Scorecard" exportMetadata={exportMetadata}>
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
  { stars: 0, description: "No recorded performance" },
  { stars: 1, description: "Bottom 20% of producers" },
  { stars: 2, description: "21st–40th percentile" },
  { stars: 3, description: "41st–60th percentile" },
  { stars: 4, description: "61st–80th percentile" },
  { stars: 5, description: "Top 20% of producers" },
] as const;

function percentileTierLabel(rating: StarRating | null): string {
  if (rating == null) return "Unavailable";
  return PRODUCER_SCORECARD_LEVELS.find((level) => level.stars === rating)?.description ?? "Unavailable";
}

function ProducerNumbersGrid({
  preview,
  overview,
  ratings,
}: {
  preview: MonthlyProducerPreview;
  overview: ProducerOverview;
  ratings: ProducerRatings;
}) {
  const totals = overview.activity.totals;
  const items: Array<{ label: string; starLabel?: string; value: string; rating: StarRating | null }> = [
    { label: "IP", starLabel: "Issued Premium", value: money(preview.totalIssuedIpCents), rating: ratings.issuedIp },
    { label: "AP", starLabel: "Submitted AP", value: overview.submittedApCents == null ? "Unavailable" : money(overview.submittedApCents), rating: ratings.submittedAp },
    { label: "Lead Spend", value: money(overview.activity.leadSpendCents), rating: ratings.leadSpend },
    { label: "Dials", value: totals?.dials.toLocaleString() ?? "Unavailable", rating: ratings.dials },
    { label: "Contacts", value: totals?.contacts.toLocaleString() ?? "Unavailable", rating: ratings.contacts },
    { label: "Presentations", value: totals?.presentations.toLocaleString() ?? "Unavailable", rating: ratings.presentations },
    { label: "Submitted Sales", value: totals?.sales.toLocaleString() ?? "Unavailable", rating: ratings.sales },
  ];

  return (
    <div className="producer-numbers-grid flex flex-wrap justify-center gap-3" role="list" aria-label={`${preview.periodLabel} producer numbers`}>
      {items.map((item) => (
        <div key={item.label} className="producer-number-card w-full shrink-0 rounded-xl border border-hairline bg-card px-5 py-5 sm:w-[calc(50%-0.375rem)] lg:w-[calc(25%-0.5625rem)]" role="listitem">
          <p className="producer-number-card__label text-sm text-subtle">{item.label}</p>
          <p className="producer-number-card__value mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-none tabular-nums text-ink">{item.value}</p>
          {item.rating != null ? <p className="mt-4"><StarScale value={item.rating} label={item.starLabel ?? item.label} /></p> : null}
          <p className="producer-number-card__percentile mt-4 text-sm font-medium leading-5 text-accent">{percentileTierLabel(item.rating)}</p>
        </div>
      ))}
    </div>
  );
}

function ScorecardHowItWorks() {
  return (
    <section
      id="scorecard-how-it-works"
      aria-labelledby="scorecard-how-it-works-title"
      className="relative border-t border-hairline bg-background px-6 py-12 [letter-spacing:0.2px] sm:px-12 sm:py-[3.2rem] lg:px-20"
    >
      <details open className="scorecard-guide">
        <summary
          aria-label="Toggle How Scorecards Work"
          aria-controls="scorecard-how-it-works-content"
          className="scorecard-guide__summary flex cursor-pointer list-none items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:gap-5 [&::-webkit-details-marker]:hidden"
        >
          <span aria-hidden="true" className="scorecard-guide__chevron grid size-10 shrink-0 place-items-center text-accent sm:size-12">
            <svg viewBox="0 0 24 24" className="size-6 sm:size-7" fill="none">
              <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h3
            id="scorecard-how-it-works-title"
            className="max-w-4xl text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[0.95] text-ink"
          >
            How Scorecards Work
          </h3>
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

          <div className="mt-9 max-w-4xl text-base leading-7 text-white sm:text-lg sm:leading-8">
            <p>We then rank your performance in all 8 areas against the entire organization and average out your rankings to give you an overall score:</p>

            <dl className="mx-auto mt-6 max-w-2xl border-y border-hairline">
              {PRODUCER_SCORECARD_LEVELS.map((level) => (
                <div key={level.stars} className="grid grid-cols-[7.25rem_minmax(0,1fr)] items-center gap-4 border-b border-hairline py-3.5 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  <dt>
                    <span className="inline-flex items-center gap-1 text-lg leading-none sm:text-xl" aria-label={`${level.stars} out of 5 stars`}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <span key={index} className={index < level.stars ? "text-accent" : "text-white/20"} aria-hidden="true">★</span>
                      ))}
                    </span>
                  </dt>
                  <dd className="text-white">{level.description}</dd>
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
    issuedIp: producerRankStars(preview.totalIssuedIpCents, overview.rank),
    submittedAp: overview.submittedApCents == null
      ? null
      : producerRankStars(overview.submittedApCents, overview.organizationRanks.submittedAp),
    leadSpend: producerRankStars(overview.activity.leadSpendCents, overview.organizationRanks.leadSpend),
    dials: totals ? producerRankStars(totals.dials, overview.organizationRanks.dials) : null,
    contacts: totals ? producerRankStars(totals.contacts, overview.organizationRanks.contacts) : null,
    presentations: totals ? producerRankStars(totals.presentations, overview.organizationRanks.presentations) : null,
    sales: totals ? producerRankStars(totals.sales, overview.organizationRanks.sales) : null,
    trackingConsistency: overview.activity.consistency
      ? producerRankStars(overview.activity.consistency.loggedDays, overview.organizationRanks.trackingConsistency)
      : null,
  };
}

function producerStarSummary(
  ratings: ProducerRatings,
): ProducerStarSummary | null {
  if (
    ratings.submittedAp == null ||
    ratings.dials == null ||
    ratings.contacts == null ||
    ratings.presentations == null ||
    ratings.sales == null ||
    ratings.trackingConsistency == null
  ) return null;
  return createProducerStarSummary({
    issuedIp: ratings.issuedIp,
    submittedAp: ratings.submittedAp,
    leadSpend: ratings.leadSpend,
    dials: ratings.dials,
    contacts: ratings.contacts,
    presentations: ratings.presentations,
    sales: ratings.sales,
    trackingConsistency: ratings.trackingConsistency,
  });
}

export function StarScale({
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
  maximumStars = 40,
}: {
  titleId: string;
  memberName: string;
  photoUrl: string | null;
  title: string;
  averageStars?: number | null;
  totalStars?: number | null;
  maximumStars?: number;
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
              {averageStars.toFixed(1)} average · {totalStars} of {maximumStars} total stars
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
  centerHeading = false,
  collapsible = false,
  sectionId,
  exportName,
  exportMetadata,
  children,
}: {
  number: string | null;
  title: string;
  compact?: boolean;
  condensed?: boolean;
  centerContent?: boolean;
  centerHeading?: boolean;
  collapsible?: boolean;
  sectionId: string;
  exportName: string;
  exportMetadata: { cardType: "producer" | "builder"; memberName: string; periodLabel: string };
  children: ReactNode;
}) {
  return (
    <section
      id={sectionId}
      className={`relative border-t border-hairline bg-background px-6 [letter-spacing:0.2px] sm:px-12 lg:px-20 ${collapsible || condensed ? "py-10 sm:py-12" : "min-h-[46svh] py-12 sm:min-h-[51svh] sm:py-[3.2rem]"}`}
    >
      <ScorecardExportControls sectionId={sectionId} sectionName={exportName} {...exportMetadata} />
      <div className="w-full">
        {collapsible ? (
          <details open className="scorecard-guide">
            <summary
              aria-label={`Toggle ${title}`}
              aria-controls={`${sectionId}-content`}
              className="scorecard-guide__summary flex cursor-pointer list-none items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:gap-5 [&::-webkit-details-marker]:hidden"
            >
              <span data-export-exclude="" aria-hidden="true" className="scorecard-guide__chevron grid size-10 shrink-0 place-items-center text-accent sm:size-12">
                <svg viewBox="0 0 24 24" className="size-6 sm:size-7" fill="none">
                  <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h3 className="text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[0.95] text-ink">{title}</h3>
            </summary>
            <div id={`${sectionId}-content`} className={`${compact ? "mt-8 sm:mt-10" : "mt-10 sm:mt-12"} max-w-4xl ${centerContent ? "mx-auto" : ""}`}>{children}</div>
          </details>
        ) : (
          <>
            <div className={`flex items-baseline gap-5 sm:gap-7 ${centerHeading ? "justify-center text-center" : ""}`}>
              {number ? <p className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tabular-nums text-accent">{number}</p> : null}
              <h3 className="text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[0.95] text-ink">{title}</h3>
            </div>
            <div className={`${compact ? "mt-8 sm:mt-10" : "mt-10 sm:mt-12"} max-w-4xl ${centerContent ? "mx-auto" : ""}`}>{children}</div>
          </>
        )}
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
          <p className="text-sm font-medium text-subtle sm:text-base">Tracking Consistency</p>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <p className="text-[clamp(3rem,8vw,6rem)] font-semibold leading-none tabular-nums text-ink">{consistency.percentage}%</p>
            {rating != null ? <span className="pb-1"><StarScale value={rating} label="Tracking Consistency" /></span> : null}
          </div>
          <p className="tracking-summary mt-3 text-base text-subtle sm:text-lg">{consistency.loggedDays} of {consistency.expectedDays} expected workdays logged</p>
          <p className="tracking-percentile mt-3 text-sm font-medium text-accent sm:text-base">{percentileTierLabel(rating)}</p>
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
    if (previous === 0) return current === 0 ? "0%" : "New Baseline";
    const percentage = Math.round(((current - previous) / previous) * 1_000) / 10;
    return `${percentage > 0 ? "+" : ""}${percentage}%`;
  };
  const formatCount = (value: number | null) => value == null ? "Unavailable" : value.toLocaleString();
  const previousActivity = overview.priorActivityTotals;
  const currentActivity = overview.activity.totals;
  const comparisons = [
    { label: "Issued Premium", previous: overview.priorIssuedIpCents, current: preview.totalIssuedIpCents, format: (value: number | null) => value == null ? "Unavailable" : money(value) },
    { label: "Submitted AP", previous: overview.priorSubmittedApCents, current: overview.submittedApCents, format: (value: number | null) => value == null ? "Unavailable" : money(value) },
    { label: "Lead Spend", previous: overview.priorLeadSpendCents, current: overview.activity.leadSpendCents, format: (value: number | null) => value == null ? "Unavailable" : money(value) },
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

export function ScorecardsPageShell({ preview, overview }: { preview: MonthlyProducerPreview; overview: ProducerOverview }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <ProducerScorecardPreview preview={preview} overview={overview} />
    </main>
  );
}
