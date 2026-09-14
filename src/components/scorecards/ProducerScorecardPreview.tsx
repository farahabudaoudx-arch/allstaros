import BackgroundShader from "@/components/ui/background-shader";
import type {
  MonthlyProducerPreview,
  ProducerOverview,
} from "@/lib/scorecards/lifecycle";
import { scaleCumulativeThreshold } from "@/lib/scorecards/period";
import type { ScorecardPeriodKind } from "@/lib/scorecards/run";
import { Avatar } from "@/components/Avatar";
import type { ReactNode } from "react";
import {
  countProducerTrackingDays,
  createProducerStarSummary,
  type ProducerStarSummary,
  type StarRating,
} from "@/lib/scorecards/ratings";
import { ScorecardExportControls } from "./ScorecardExportControls";
import { ProducerBaseballCard } from "./ProducerBaseballCard";
import { ScorecardStars } from "./ScorecardStars";
import { DownloadGlyph } from "./ScorecardExportControls";
import { installationTimezone } from "@/lib/installation/runtime";
import { InstallationLogo } from "@/components/InstallationLogo";

export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function moneyBand(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000) {
    const thousands = dollars / 1_000;
    const label = Number.isInteger(thousands) ? String(thousands) : thousands.toFixed(1).replace(/\.0$/, "");
    return `$${label}k`;
  }
  return money(cents);
}

export type StarBand = {
  stars: StarRating;
  label: string;
};

export type StarBandMetric = {
  label: string;
  weight?: string;
  note?: string;
  bands: readonly StarBand[];
};

export function ProducerScorecardPreview({
  preview,
  overview,
  periodKind = "monthly",
  frozenScore,
}: {
  preview: MonthlyProducerPreview;
  overview: ProducerOverview;
  periodKind?: ScorecardPeriodKind;
  frozenScore?: ProducerStarSummary;
}) {
  const trackingLoggedDays = countProducerTrackingDays(overview.activity.loggedDates);
  const starSummary = frozenScore ?? createProducerStarSummary({
    issuedIpCents: preview.totalIssuedIpCents,
    trackingLoggedDays,
    leadSpendCents: overview.activity.leadSpendCents,
    periodKind,
  });
  const ratings = starSummary.ratings;
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
        averageStars={starSummary.overall}
        totalStars={starSummary.overall}
        maximumStars={5}
        ratingLabel="Overall rating"
        ratingSummary={`${starSummary.overall.toFixed(2)} weighted score`}
      />

      <ScorecardHowItWorks periodKind={periodKind} />

      <StorySection number={null} title="Scored Metrics" collapsible sectionId="scorecard-section-scored" exportName="Scored Metrics" exportMetadata={exportMetadata}>
        <div className="space-y-10">
          <ProducerScoredMetricsGrid preview={preview} overview={overview} ratings={ratings} />
          <TrackingConsistencyCalendar
            preview={preview}
            activity={overview.activity}
            rating={ratings.trackingConsistency}
            scoredLoggedDays={trackingLoggedDays}
          />
        </div>
      </StorySection>

      <StorySection number={null} title="Unscored Metrics" collapsible sectionId="scorecard-section-unscored" exportName="Unscored Metrics" exportMetadata={exportMetadata}>
        <ProducerUnscoredMetricsGrid preview={preview} overview={overview} />
      </StorySection>

      <StorySection number={null} title="Your Scorecard" centerContent centerHeading sectionId="scorecard-section-card" exportName="Your Scorecard" exportMetadata={exportMetadata}>
        <ProducerBaseballCard
          memberName={overview.producer.fullName}
          photoUrl={overview.producer.photoUrl}
          periodLabel={preview.periodLabel}
          averageRating={starSummary.overall}
          totalRating={null}
          ratings={[
            { label: "Personal IP", value: ratings.issuedIp, metricValue: money(preview.totalIssuedIpCents) },
            { label: "Tracking", value: ratings.trackingConsistency, metricValue: `${trackingLoggedDays} days` },
            { label: "Lead Spend", value: ratings.leadSpend, metricValue: money(overview.activity.leadSpendCents) },
          ]}
        />
      </StorySection>
    </article>
  );
}

function producerScorecardAreas(periodKind: ScorecardPeriodKind): StarBandMetric[] {
  const ip = (base: number) => scaleCumulativeThreshold(base, periodKind);
  const days = (base: number) => scaleCumulativeThreshold(base, periodKind);
  const spend = (base: number) => scaleCumulativeThreshold(base, periodKind);
  return [
    {
      label: "Personal IP",
      weight: "50%",
      bands: [
        { stars: 0, label: `Under ${moneyBand(ip(500_000))}` },
        { stars: 1, label: `${moneyBand(ip(500_000))} – under ${moneyBand(ip(1_500_000))}` },
        { stars: 2, label: `${moneyBand(ip(1_500_000))} – under ${moneyBand(ip(2_000_000))}` },
        { stars: 3, label: `${moneyBand(ip(2_000_000))} – under ${moneyBand(ip(3_000_000))}` },
        { stars: 4, label: `${moneyBand(ip(3_000_000))} – under ${moneyBand(ip(4_000_000))}` },
        { stars: 5, label: `${moneyBand(ip(4_000_000))}+` },
      ],
    },
    {
      label: "Tracking",
      weight: "25%",
      bands: [
        { stars: 0, label: `0 – ${days(8) - 1} days` },
        { stars: 1, label: `${days(8)} – ${days(12) - 1} days` },
        { stars: 2, label: `${days(12)} – ${days(16) - 1} days` },
        { stars: 3, label: `${days(16)} – ${days(20) - 1} days` },
        { stars: 4, label: `${days(20)} – ${days(24) - 1} days` },
        { stars: 5, label: `${days(24)}+ days` },
      ],
    },
    {
      label: "Lead Spend",
      weight: "25%",
      bands: [
        { stars: 0, label: `Under ${moneyBand(spend(200_000))}` },
        { stars: 1, label: `${moneyBand(spend(200_000))} – under ${moneyBand(spend(400_000))}` },
        { stars: 2, label: `${moneyBand(spend(400_000))} – under ${moneyBand(spend(600_000))}` },
        { stars: 3, label: `${moneyBand(spend(600_000))} – under ${moneyBand(spend(800_000))}` },
        { stars: 4, label: `${moneyBand(spend(800_000))} – under ${moneyBand(spend(1_000_000))}` },
        { stars: 5, label: `${moneyBand(spend(1_000_000))}+` },
      ],
    },
  ];
}

export function builderScorecardAreas(periodKind: ScorecardPeriodKind): StarBandMetric[] {
  const recruits = (base: number) => scaleCumulativeThreshold(base, periodKind);
  return [
    {
      label: "Growth %",
      weight: "20%",
      bands: [
        { stars: 0, label: "Negative" },
        { stars: 1, label: "0%–3.99%" },
        { stars: 2, label: "4%–7.99%" },
        { stars: 3, label: "8%–11.99%" },
        { stars: 4, label: "12%–15.99%" },
        { stars: 5, label: "16%+" },
      ],
    },
    {
      label: "First Leg %",
      weight: "20%",
      bands: [
        { stars: 0, label: "70%+" },
        { stars: 1, label: "60% – under 70%" },
        { stars: 2, label: "50% – under 60%" },
        { stars: 3, label: "40% – under 50%" },
        { stars: 4, label: "30% – under 40%" },
        { stars: 5, label: "Under 30%" },
      ],
    },
    {
      label: "Active Directs",
      weight: "20%",
      bands: [
        { stars: 0, label: "0" },
        { stars: 1, label: "1" },
        { stars: 2, label: "2" },
        { stars: 3, label: "3 – 4" },
        { stars: 4, label: "5 – 7" },
        { stars: 5, label: "8+" },
      ],
    },
    {
      label: "Avg IP / Active Writer",
      weight: "20%",
      bands: [
        { stars: 0, label: `Under ${moneyBand(500_000)}` },
        { stars: 1, label: `${moneyBand(500_000)} – under ${moneyBand(750_000)}` },
        { stars: 2, label: `${moneyBand(750_000)} – under ${moneyBand(1_000_000)}` },
        { stars: 3, label: `${moneyBand(1_000_000)} – under ${moneyBand(1_250_000)}` },
        { stars: 4, label: `${moneyBand(1_250_000)} – under ${moneyBand(1_500_000)}` },
        { stars: 5, label: `${moneyBand(1_500_000)}+` },
      ],
    },
    {
      label: "Recruits Licensed",
      weight: "20%",
      bands: [
        { stars: 0, label: `Under ${recruits(1)}` },
        { stars: 1, label: `${recruits(1)} – under ${recruits(2)}` },
        { stars: 2, label: `${recruits(2)} – under ${recruits(3)}` },
        { stars: 3, label: `${recruits(3)} – under ${recruits(4)}` },
        { stars: 4, label: `${recruits(4)} – under ${recruits(5)}` },
        { stars: 5, label: `${recruits(5)}+` },
      ],
    },
  ];
}

export function StarBandLegend({ metric }: { metric: StarBandMetric }) {
  return (
    <li className="scorecard-band-panel rounded-xl px-5 py-5 text-ink">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">{metric.label}</span>
        {metric.weight ? <span className="text-sm font-medium text-accent">{metric.weight}</span> : null}
      </div>
      {metric.note ? <p className="mt-2 text-sm leading-6 text-subtle">{metric.note}</p> : null}
      <ul aria-label={`${metric.label} star bands`} className="mt-4 grid gap-2.5">
        {metric.bands.map((band) => (
          <li
            key={`${metric.label}-${band.stars}`}
            className="flex items-center gap-3 text-sm leading-none"
            aria-label={`${band.stars} stars: ${band.label}`}
          >
            <StarBandRow stars={band.stars} />
            <span className="min-w-0 flex-1 text-subtle">{band.label}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function StarBandRow({ stars }: { stars: StarRating }) {
  return <span className="scorecard-band-stars"><ScorecardStars value={stars} decorative /></span>;
}

function MetricCards({
  items,
  ariaLabel,
  layout,
}: {
  items: Array<{ label: string; starLabel?: string; value: string; rating?: StarRating | null }>;
  ariaLabel: string;
  layout: "scored" | "unscored";
}) {
  return (
    <div className={`producer-numbers-grid scorecard-metrics scorecard-metrics--${layout}`} role="list" aria-label={ariaLabel}>
      {items.map((item) => {
        const unavailable = item.value === "Unavailable";
        return (
          <div key={item.label} className="producer-number-card scorecard-metric" role="listitem">
            <p className="producer-number-card__label scorecard-metric__label">{item.label}</p>
            <p className={`producer-number-card__value scorecard-metric__value${unavailable ? " scorecard-metric__value--unavailable" : ""}`}>{item.value}</p>
            {item.rating != null ? <p className="scorecard-metric__rating"><StarScale value={item.rating} label={item.starLabel ?? item.label} /></p> : null}
          </div>
        );
      })}
    </div>
  );
}

function ProducerScoredMetricsGrid({
  preview,
  overview,
  ratings,
}: {
  preview: MonthlyProducerPreview;
  overview: ProducerOverview;
  ratings: ProducerRatings;
}) {
  return (
    <MetricCards
      ariaLabel={`${preview.periodLabel} scored producer metrics`}
      layout="scored"
      items={[
        { label: "IP", starLabel: "Issued Premium", value: money(preview.totalIssuedIpCents), rating: ratings.issuedIp },
        { label: "Lead Spend", value: money(overview.activity.leadSpendCents), rating: ratings.leadSpend },
      ]}
    />
  );
}

function ProducerUnscoredMetricsGrid({
  preview,
  overview,
}: {
  preview: MonthlyProducerPreview;
  overview: ProducerOverview;
}) {
  const totals = overview.activity.totals;
  return (
    <MetricCards
      ariaLabel={`${preview.periodLabel} unscored producer metrics`}
      layout="unscored"
      items={[
        { label: "AP", starLabel: "Submitted AP", value: overview.submittedApCents == null ? "Unavailable" : money(overview.submittedApCents) },
        { label: "Dials", value: totals?.dials.toLocaleString() ?? "Unavailable" },
        { label: "Contacts", value: totals?.contacts.toLocaleString() ?? "Unavailable" },
        { label: "Presentations", value: totals?.presentations.toLocaleString() ?? "Unavailable" },
        { label: "Submitted Sales", value: totals?.sales.toLocaleString() ?? "Unavailable" },
      ]}
    />
  );
}

function ScorecardHowItWorks({ periodKind }: { periodKind: ScorecardPeriodKind }) {
  const areas = producerScorecardAreas(periodKind);
  return (
    <section
      id="scorecard-how-it-works"
      aria-labelledby="scorecard-how-it-works-title"
      className="relative border-t border-hairline bg-background px-6 py-12 [letter-spacing:0.2px] sm:px-12 sm:py-[3.2rem] lg:px-20"
    >
      <details open className="scorecard-guide">
        <summary
          aria-label="Toggle How You're Scored"
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
            How You&apos;re Scored
          </h3>
        </summary>

        <div id="scorecard-how-it-works-content" className="w-full">
          <ul aria-label="Three Producer scorecard areas" className="mt-7 grid gap-4 lg:grid-cols-3">
            {areas.map((area) => (
              <StarBandLegend key={area.label} metric={area} />
            ))}
          </ul>

          <div className="scorecard-explanation mt-14 max-w-4xl space-y-9 sm:mt-16 sm:space-y-10 text-base leading-7 text-ink sm:text-lg sm:leading-8">
            <p>We use a weighted score across these metrics with 50% of your overall score being attributed to Personal IP, 25% of your score going to Tracking, and another 25% going to Lead Spend.</p>
            <p>We also include on here metrics that may be useful for you to see, but aren&apos;t what we use to create your scorecard rating.</p>
            <p>You can download 9:16 or 16:9 screenshots of each section of the scorecard to post online by clicking the <span className="scorecard-inline-icon" role="img" aria-label="portrait download"><DownloadGlyph format="portrait" /></span> or <span className="scorecard-inline-icon" role="img" aria-label="landscape download"><DownloadGlyph format="landscape" /></span> button in the top right.</p>
            <p>Something to keep in mind is that numbers don&apos;t lie! If you don&apos;t like your score, it simply means you got some work to do. If you believe we made an error and the numbers aren&apos;t accurate, tap the &quot;Report a Bug&quot; button in the bottom left.</p>
          </div>
        </div>
      </details>
    </section>
  );
}

type ProducerRatings = ProducerStarSummary["ratings"];

export function StarScale({
  value,
  label,
  prominent = false,
}: {
  value: number;
  label: string;
  prominent?: boolean;
}) {
  return <ScorecardStars value={value} label={label} prominent={prominent} />;
}

export function ScorecardHeader({
  titleId,
  memberName,
  photoUrl,
  title,
  averageStars,
  totalStars,
  maximumStars = 40,
  ratingLabel = "Average rating",
  ratingSummary,
}: {
  titleId: string;
  memberName: string;
  photoUrl: string | null;
  title: string;
  averageStars?: number | null;
  totalStars?: number | null;
  maximumStars?: number;
  ratingLabel?: string;
  ratingSummary?: string;
}) {
  return (
    <BackgroundShader>
      <header className="border-b border-white/10 px-5 pb-7 pt-8 text-center sm:px-7 sm:pb-8 sm:pt-10">
        <InstallationLogo className="mx-auto mb-6 h-10 w-auto opacity-90 sm:h-12" />
        <Avatar
          name={memberName}
          photoUrl={photoUrl}
          className="mx-auto h-24 w-24 text-2xl ring-4 ring-black/70 outline outline-1 outline-offset-4 outline-white/25 sm:h-28 sm:w-28"
        />
        <h2 id={titleId} className="mx-auto mt-6 max-w-3xl break-words px-2 text-xl font-semibold leading-tight tracking-[-0.035em] text-white sm:text-2xl">
          {memberName}
        </h2>
        <p className="mx-auto mt-3 max-w-3xl break-words text-[1.35rem] font-semibold leading-snug tracking-[-0.025em] text-white/85 sm:text-3xl">{title}</p>
        {averageStars != null && totalStars != null ? (
          <div className="mt-5 flex flex-col items-center gap-2">
            <StarScale value={averageStars} label={ratingLabel} prominent />
            <p className="max-w-2xl text-center text-sm font-medium leading-5 tabular-nums text-white/65">
              {ratingSummary ?? `${averageStars.toFixed(1)} average · ${totalStars} of ${maximumStars} total stars`}
            </p>
          </div>
        ) : null}
      </header>
    </BackgroundShader>
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

function calendarDates(periodStart: string, periodEnd: string): Array<string | null> {
  const first = new Date(`${periodStart}T00:00:00Z`);
  const last = new Date(`${periodEnd}T00:00:00Z`);
  const dates: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null);

  for (const date = new Date(first); date <= last; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
}

function chicagoDateFromInstant(instantText: string): string | null {
  const instant = new Date(instantText);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: installationTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function TrackingConsistencyCalendar({
  preview,
  activity,
  rating,
  scoredLoggedDays,
}: {
  preview: MonthlyProducerPreview;
  activity: ProducerOverview["activity"];
  rating: StarRating;
  scoredLoggedDays: number;
}) {
  const loggedDates = new Set(activity.loggedDates);
  const dates = calendarDates(preview.periodStart, preview.periodEnd);
  const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const generatedBusinessDate = chicagoDateFromInstant(preview.generatedAt);
  const scoredThrough = generatedBusinessDate == null
    ? null
    : generatedBusinessDate < preview.periodStart
      ? null
      : generatedBusinessDate > preview.periodEnd
        ? preview.periodEnd
        : generatedBusinessDate;

  return (
    <div className="tracking-story max-w-4xl">
      <div className="tracking-head flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-subtle sm:text-base">Tracking Consistency</p>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <p className="text-[clamp(3rem,8vw,6rem)] font-semibold leading-none tabular-nums text-ink">{scoredLoggedDays}</p>
            <span className="pb-1"><StarScale value={rating} label="Tracking Consistency" /></span>
          </div>
          <p className="tracking-summary mt-3 text-base text-subtle sm:text-lg">Logged days in this period · all seven weekdays count</p>
        </div>
        <div className="tracking-legend flex gap-5 text-sm text-subtle" aria-label="Calendar status legend">
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-pos" aria-hidden="true" />Logged</span>
          {activity.expectedDates ? <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-neg" aria-hidden="true" />Did Not Log</span> : null}
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
            const missed = scoredThrough != null && date <= scoredThrough && !logged;
            const status = logged
              ? "Logged"
              : missed ? "Did Not Log" : "Not Yet Scored";
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

export function ScorecardsPageShell({
  preview,
  overview,
  periodKind = "monthly",
}: {
  preview: MonthlyProducerPreview;
  overview: ProducerOverview;
  periodKind?: ScorecardPeriodKind;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <ProducerScorecardPreview preview={preview} overview={overview} periodKind={periodKind} />
    </main>
  );
}
