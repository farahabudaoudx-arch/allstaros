import type { BuilderPeriodMetric, ScorecardPeriodKind } from "@/lib/scorecards/run";
import type {
  BuilderAgencyPerformance,
  BuilderAgencyValues,
  BuilderPerformanceKey,
} from "@/lib/scorecards/builder-performance";
import {
  createBuilderStarSummary,
  type BuilderStarRatings,
  type BuilderStarSummary,
} from "@/lib/scorecards/ratings";
import {
  money,
  ScorecardHeader,
  StarScale,
  StorySection,
} from "./ProducerScorecardPreview";
import { ScorecardBaseballCard } from "./ProducerBaseballCard";

export type BuilderScorecardView = {
  member: { fullName: string; photoUrl: string | null };
  period: {
    kind: ScorecardPeriodKind;
    label: string;
    previousLabel: string;
  };
  metric: BuilderScorecardMetric;
};

export type BuilderScorecardMetric = Pick<BuilderPeriodMetric,
  | "teamIpCents"
  | "teamRank"
  | "teamRankUnavailableReason"
  | "activeWriters"
  | "firstLegPercent"
  | "averageMonthlyIpPerWriterCents"
  | "monthCount"
  | "growth"
  | "recruitsAdded"
  | "recruitingRank"
  | "trend"
> & {
  performance: BuilderAgencyPerformance;
  previousPerformance: BuilderAgencyValues;
};

const BUILDER_RATING_METRICS = [
  "Growth %",
  "First Leg %",
  "Active Directs",
  "Avg IP / Active Writer",
  "Recruits Licensed",
] as const;

const BUILDER_SCORED_METRICS: ReadonlyArray<{
  key: Exclude<BuilderPerformanceKey, "recruits" | "teamDials" | "teamContacts" | "teamPresentations" | "teamSales" | "teamAp" | "teamIp"> | "growth" | "recruits";
  label: string;
  ratingKey: keyof BuilderStarRatings;
  ratingLabel: string;
}> = [
  { key: "growth", label: "Growth %", ratingKey: "growth", ratingLabel: "Growth %" },
  { key: "firstLegPercent", label: "First Leg %", ratingKey: "firstLegPercent", ratingLabel: "First Leg %" },
  { key: "activeWriters", label: "Active Directs", ratingKey: "activeDirects", ratingLabel: "Active Directs" },
  { key: "averageIpPerWriter", label: "Avg IP / Active Writer", ratingKey: "averageIpPerActiveWriter", ratingLabel: "Avg IP / Active Writer" },
  { key: "recruits", label: "Recruits Licensed", ratingKey: "recruitsLicensed", ratingLabel: "Recruits Licensed" },
];

const BUILDER_UNSCORED_METRICS: ReadonlyArray<{
  key: Exclude<BuilderPerformanceKey, "recruits" | "activeWriters" | "firstLegPercent" | "averageIpPerWriter">;
  label: string;
}> = [
  { key: "teamDials", label: "Total Team Dials" },
  { key: "teamContacts", label: "Total Team Contacts" },
  { key: "teamPresentations", label: "Total Team Presentations" },
  { key: "teamSales", label: "Total Team Sales" },
  { key: "teamAp", label: "Total Team AP" },
  { key: "teamIp", label: "Total Team IP" },
];

function BuilderScorecardHowItWorks() {
  return (
    <section
      id="builder-scorecard-how-it-works"
      aria-labelledby="builder-scorecard-how-it-works-title"
      className="relative border-t border-hairline bg-background px-6 py-12 [letter-spacing:0.2px] sm:px-12 sm:py-[3.2rem] lg:px-20"
    >
      <details open className="scorecard-guide">
        <summary
          aria-label="Toggle How You're Scored"
          aria-controls="builder-scorecard-how-it-works-content"
          className="scorecard-guide__summary flex cursor-pointer list-none items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:gap-5 [&::-webkit-details-marker]:hidden"
        >
          <span aria-hidden="true" className="scorecard-guide__chevron grid size-10 shrink-0 place-items-center text-accent sm:size-12">
            <svg viewBox="0 0 24 24" className="size-6 sm:size-7" fill="none">
              <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h3
            id="builder-scorecard-how-it-works-title"
            className="max-w-4xl text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[0.95] text-ink"
          >
            How You&apos;re Scored
          </h3>
        </summary>

        <div id="builder-scorecard-how-it-works-content" className="w-full">
          <p className="scorecard-copy mt-9 max-w-4xl text-base leading-7 text-white sm:text-lg sm:leading-8">
            Builder ratings use five fixed performance bands, not organization rank or percentile.
          </p>

          <div className="mt-9 max-w-4xl text-base leading-7 text-white sm:text-lg sm:leading-8">
            <p>Each of these five metrics contributes exactly 20% to your overall Builder rating:</p>
            <ul aria-label="Five Builder rating metrics" className="mt-6 grid gap-3 sm:grid-cols-2">
              {BUILDER_RATING_METRICS.map((metric) => (
                <li key={metric} className="rounded-xl border border-hairline bg-card px-4 py-3 font-medium text-ink">
                  {metric}
                </li>
              ))}
            </ul>
            <p className="mt-6">Overall rating = 20% Growth + 20% First Leg + 20% Active Directs + 20% Avg IP/Active Writer + 20% Recruits Licensed.</p>
            <p className="mt-6">Lower First Leg % is better. Missing or unusable rating inputs score 0 stars.</p>
            <p className="mt-6">Scored metrics affect your rating. Unscored metrics are still useful team context, but they do not change your stars.</p>
            <p className="mt-6">
              You can download 9:16 or 16:9 screenshots of each section to post online.
            </p>
            <p className="mt-6 font-semibold text-white">
              If you are not proud to post your numbers online, chances are you should get to work. Numbers don&apos;t lie. If you don&apos;t like your score, do something about it!
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

function percent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

function metricValue(key: BuilderPerformanceKey | "growth", value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  if (key === "growth") return percent(value);
  if (key === "teamAp" || key === "teamIp" || key === "averageIpPerWriter") {
    return money(value);
  }
  if (key === "firstLegPercent") {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  }
  return value.toLocaleString();
}

function scoredMetricValue(
  key: (typeof BUILDER_SCORED_METRICS)[number]["key"],
  metric: BuilderScorecardMetric,
): number | null {
  if (key === "growth") return metric.growth.percentage;
  if (key === "recruits") return metric.recruitsAdded;
  if (key === "activeWriters") return metric.activeWriters;
  if (key === "firstLegPercent") return metric.firstLegPercent;
  return metric.averageMonthlyIpPerWriterCents;
}

function BuilderScoredMetricsGrid({
  metric,
  ratings,
}: {
  metric: BuilderScorecardMetric;
  ratings: BuilderStarRatings;
}) {
  return (
    <div className="producer-numbers-grid flex flex-wrap justify-center gap-3" role="list" aria-label="Builder scored metrics">
      {BUILDER_SCORED_METRICS.map((item) => {
        const rating = ratings[item.ratingKey];
        return (
          <div key={item.key} className="producer-number-card w-full shrink-0 rounded-xl border border-hairline bg-card px-5 py-5 md:w-[calc(33.333%-0.5rem)]" role="listitem">
            <p className="producer-number-card__label text-sm text-subtle">{item.label}</p>
            <p className="producer-number-card__value mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-none tabular-nums text-ink">
              {metricValue(item.key, scoredMetricValue(item.key, metric))}
            </p>
            <p className="mt-4"><StarScale value={rating} label={item.ratingLabel} /></p>
          </div>
        );
      })}
    </div>
  );
}

function BuilderUnscoredMetricsGrid({
  performance,
}: {
  performance: BuilderAgencyPerformance;
}) {
  return (
    <div className="producer-numbers-grid flex flex-wrap justify-center gap-3" role="list" aria-label="Builder unscored metrics">
      {BUILDER_UNSCORED_METRICS.map((item) => (
        <div key={item.key} className="producer-number-card w-full shrink-0 rounded-xl border border-hairline bg-card px-5 py-5 md:w-[calc(33.333%-0.5rem)]" role="listitem">
          <p className="producer-number-card__label text-sm text-subtle">{item.label}</p>
          <p className="producer-number-card__value mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-none tabular-nums text-ink">
            {metricValue(item.key, performance[item.key].value)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function BuilderScorecardPreview({
  view,
  frozenScore,
}: {
  view: BuilderScorecardView;
  frozenScore?: BuilderStarSummary;
}) {
  // #015 defines the legacy `activeWriters` payload field as Active Directs.
  // #016 defines the legacy `recruitsAdded` payload field as Recruits Licensed.
  // #017 scales only cumulative targets; snapshot/rate/monthly-normalized metrics stay fixed.
  const summary = frozenScore ?? createBuilderStarSummary({
    growthPercent: view.metric.growth.percentage,
    priorPeriodBaseline: view.metric.growth.priorTeamIpCents,
    firstLegPercent: view.metric.firstLegPercent,
    activeDirects: view.metric.activeWriters,
    averageIpPerActiveWriterCents: view.metric.averageMonthlyIpPerWriterCents,
    recruitsLicensed: view.metric.recruitsAdded,
    periodKind: view.period.kind,
  });
  const ratings = summary.ratings;
  const exportMetadata = {
    cardType: "builder" as const,
    memberName: view.member.fullName,
    periodLabel: view.period.label,
  };

  return (
    <article aria-labelledby="builder-scorecard-title" className="overflow-hidden rounded-[1.4rem] border border-hairline bg-card">
      <ScorecardHeader
        titleId="builder-scorecard-title"
        memberName={view.member.fullName}
        photoUrl={view.member.photoUrl}
        title={`${view.period.label}${view.period.kind === "annual" ? " Annual" : ""} Builder Scorecard`}
        averageStars={summary.average}
        totalStars={summary.total}
        maximumStars={25}
      />

      <BuilderScorecardHowItWorks />

      <StorySection number={null} title="Scored Metrics" collapsible sectionId="builder-scorecard-section-scored" exportName="Scored Metrics" exportMetadata={exportMetadata}>
        <BuilderScoredMetricsGrid metric={view.metric} ratings={ratings} />
      </StorySection>

      <StorySection number={null} title="Unscored Metrics" collapsible sectionId="builder-scorecard-section-unscored" exportName="Unscored Metrics" exportMetadata={exportMetadata}>
        <BuilderUnscoredMetricsGrid performance={view.metric.performance} />
      </StorySection>

      <StorySection number={null} title="Your Scorecard" centerContent centerHeading sectionId="builder-scorecard-section-card" exportName="Your Scorecard" exportMetadata={exportMetadata}>
        <ScorecardBaseballCard
          memberName={view.member.fullName}
          photoUrl={view.member.photoUrl}
          periodLabel={view.period.label}
          scorecardType="Builder"
          averageRating={summary.average}
          totalRating={summary.total}
          maximumRatingTotal={25}
          ratings={[
            { label: "Growth %", value: ratings.growth },
            { label: "First Leg %", value: ratings.firstLegPercent },
            { label: "Active Directs", value: ratings.activeDirects },
            { label: "Avg IP / Active Writer", value: ratings.averageIpPerActiveWriter },
            { label: "Recruits Licensed", value: ratings.recruitsLicensed },
          ]}
        />
      </StorySection>
    </article>
  );
}
