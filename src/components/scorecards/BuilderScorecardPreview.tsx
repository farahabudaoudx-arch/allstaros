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
  type StarRating,
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

const BUILDER_SCORECARD_AREAS = [
  "Team Production",
  "Recruiting",
] as const;

const BUILDER_RATING_METRICS = [
  "Growth %",
  "First Leg %",
  "Active Directs",
  "Avg IP / Active Writer",
  "Recruits Licensed",
] as const;

const BUILDER_PRODUCTION_METRICS: ReadonlyArray<{
  key: Exclude<BuilderPerformanceKey, "recruits">;
  label: string;
  ratingKey?: keyof BuilderStarRatings;
  ratingLabel?: string;
}> = [
  { key: "activeWriters", label: "Active Directs", ratingKey: "activeDirects", ratingLabel: "Active Directs" },
  { key: "teamDials", label: "Total Team Dials" },
  { key: "teamContacts", label: "Total Team Contacts" },
  { key: "teamPresentations", label: "Total Team Presentations" },
  { key: "teamSales", label: "Total Team Sales" },
  { key: "teamAp", label: "Total Team AP" },
  { key: "teamIp", label: "Total Team IP" },
  { key: "firstLegPercent", label: "First Leg %", ratingKey: "firstLegPercent", ratingLabel: "First Leg %" },
  { key: "averageIpPerWriter", label: "Avg IP Per Writer", ratingKey: "averageIpPerActiveWriter", ratingLabel: "Avg IP / Active Writer" },
];

const BUILDER_GROWTH_METRICS = [
  ...BUILDER_PRODUCTION_METRICS.map(({ key, label }) => ({ key, label })),
  { key: "recruits", label: "Recruits Licensed" },
] as const satisfies ReadonlyArray<{ key: BuilderPerformanceKey; label: string }>;

function BuilderScorecardHowItWorks() {
  return (
    <section
      id="builder-scorecard-how-it-works"
      aria-labelledby="builder-scorecard-how-it-works-title"
      className="relative border-t border-hairline bg-background px-6 py-12 [letter-spacing:0.2px] sm:px-12 sm:py-[3.2rem] lg:px-20"
    >
      <details open className="scorecard-guide">
        <summary
          aria-label="Toggle How Scorecards Work"
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
            How Scorecards Work
          </h3>
        </summary>

        <div id="builder-scorecard-how-it-works-content" className="w-full">
          <p className="scorecard-copy mt-9 max-w-4xl text-base leading-7 text-white sm:text-lg sm:leading-8">
            As a builder, we create a scorecard for you based on two areas the OS helps you track:
          </p>

          <ul aria-label="Two Builder scorecard areas" className="mt-7 grid grid-cols-2 gap-2 sm:gap-3">
            {BUILDER_SCORECARD_AREAS.map((area) => (
              <li
                key={area}
                className="flex min-h-20 items-center justify-center rounded-xl border border-hairline bg-card px-2 py-5 text-center text-[clamp(0.8rem,2vw,1.25rem)] font-semibold leading-tight text-ink sm:min-h-24 sm:px-4"
              >
                {area}
              </li>
            ))}
          </ul>

          <div className="mt-9 max-w-4xl text-base leading-7 text-white sm:text-lg sm:leading-8">
            <p>Builder ratings use five fixed performance bands, not organization rank or percentile.</p>
            <p className="mt-6">Each of these five metrics contributes exactly 20% to your overall Builder rating:</p>
            <ul aria-label="Five Builder rating metrics" className="mt-6 grid gap-3 sm:grid-cols-2">
              {BUILDER_RATING_METRICS.map((metric) => (
                <li key={metric} className="rounded-xl border border-hairline bg-card px-4 py-3 font-medium text-ink">
                  {metric}
                </li>
              ))}
            </ul>
            <p className="mt-6">Overall rating = 20% Growth + 20% First Leg + 20% Active Directs + 20% Avg IP/Active Writer + 20% Recruits Licensed.</p>
            <p className="mt-6">Lower First Leg % is better. Missing or unusable rating inputs score 0 stars.</p>
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

function metricValue(key: BuilderPerformanceKey, value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  if (key === "teamAp" || key === "teamIp" || key === "averageIpPerWriter") {
    return money(value);
  }
  if (key === "firstLegPercent") {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  }
  return value.toLocaleString();
}

function metricGrowth(previous: number | null, current: number | null) {
  if (previous == null || current == null || !Number.isFinite(previous) || !Number.isFinite(current)) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  if (current === 0) return -100;
  return Math.round(((current - previous) / previous) * 1_000) / 10;
}

function TeamProductionGrid({
  performance,
  ratings,
}: {
  performance: BuilderAgencyPerformance;
  ratings: BuilderStarRatings;
}) {
  return (
    <div className="producer-numbers-grid flex flex-wrap justify-center gap-3" role="list" aria-label="Builder Team Production metrics">
      {BUILDER_PRODUCTION_METRICS.map((item) => {
        const rating = item.ratingKey ? ratings[item.ratingKey] : null;
        return (
          <div key={item.key} className="producer-number-card w-full shrink-0 rounded-xl border border-hairline bg-card px-5 py-5 md:w-[calc(33.333%-0.5rem)]" role="listitem">
            <p className="producer-number-card__label text-sm text-subtle">{item.label}</p>
            <p className="producer-number-card__value mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-none tabular-nums text-ink">{metricValue(item.key, performance[item.key].value)}</p>
            {rating != null && item.ratingLabel ? <p className="mt-4"><StarScale value={rating} label={item.ratingLabel} /></p> : null}
          </div>
        );
      })}
    </div>
  );
}

function RecruitingMetric({ value, rating }: { value: number; rating: StarRating }) {
  return (
    <div className="producer-numbers-grid flex justify-center" role="list" aria-label="Builder Recruiting metric">
      <div className="producer-number-card w-full max-w-sm rounded-xl border border-hairline bg-card px-5 py-5" role="listitem">
        <p className="producer-number-card__label text-sm text-subtle">Recruits Licensed</p>
        <p className="producer-number-card__value mt-3 text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tabular-nums text-ink">{Number.isFinite(value) ? value.toLocaleString() : "Unavailable"}</p>
        <p className="mt-4"><StarScale value={rating} label="Recruits Licensed" /></p>
      </div>
    </div>
  );
}

function GrowthTable({ view, rating }: { view: BuilderScorecardView; rating: StarRating }) {
  const { metric, period } = view;
  return (
    <div className="max-w-5xl">
      <div className="mb-5 rounded-xl border border-hairline bg-card px-5 py-5 sm:px-6 sm:py-6">
        <p className="text-sm font-medium text-subtle">Team IP Growth</p>
        <p className="mt-2 break-words text-[clamp(2rem,8vw,3rem)] font-semibold leading-none tabular-nums text-ink">{percent(metric.growth.percentage)}</p>
        <p className="mt-4"><StarScale value={rating} label="Growth %" /></p>
      </div>
      <div className="growth-table border border-hairline">
        <div className="hidden grid-cols-[3fr_3fr_2fr] border-b border-hairline text-sm font-medium text-subtle sm:grid sm:text-base">
          <p className="growth-header-cell px-6 py-4">{period.previousLabel}</p>
          <p className="growth-header-cell border-l border-hairline px-6 py-4">{period.label}</p>
          <p className="growth-header-cell border-l border-hairline px-6 py-4 text-right">{metric.growth.comparison.toUpperCase()}</p>
        </div>
        {BUILDER_GROWTH_METRICS.map((item) => {
          const previous = metric.previousPerformance[item.key];
          const current = metric.performance[item.key].value;
          return (
            <div key={item.key} className="growth-row border-b border-hairline last:border-b-0 sm:grid sm:grid-cols-[3fr_3fr_2fr]">
              <div className="border-b border-hairline px-4 py-4 sm:hidden">
                <p className="growth-title text-sm font-semibold leading-5 text-ink">{item.label}</p>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-mute">{period.previousLabel}</p>
                    <p className="growth-value mt-1 break-words text-xl font-semibold leading-tight tabular-nums text-ink">{metricValue(item.key, previous)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-mute">{period.label}</p>
                    <p className="growth-value mt-1 break-words text-xl font-semibold leading-tight tabular-nums text-ink">{metricValue(item.key, current)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-hairline pt-3">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-mute">{metric.growth.comparison.toUpperCase()}</p>
                  <p className="growth-value break-words text-xl font-semibold leading-tight tabular-nums text-accent">{percent(metricGrowth(previous, current))}</p>
                </div>
              </div>
              <p className="growth-cell hidden px-6 py-5 sm:block">
                <span className="growth-title block text-sm font-medium text-subtle sm:text-base">{item.label}</span>
                <span className="growth-value mt-2 block break-words text-xl font-semibold leading-tight tabular-nums text-ink sm:text-3xl">{metricValue(item.key, previous)}</span>
              </p>
              <p className="growth-cell hidden border-l border-hairline px-6 py-5 sm:block">
                <span className="growth-title block text-sm font-medium text-subtle sm:text-base">{item.label}</span>
                <span className="growth-value mt-2 block break-words text-xl font-semibold leading-tight tabular-nums text-ink sm:text-3xl">{metricValue(item.key, current)}</span>
              </p>
              <p className="growth-cell growth-value hidden border-l border-hairline px-6 pb-5 pt-12 text-right text-xl font-semibold leading-tight tabular-nums text-accent sm:block sm:text-3xl">{percent(metricGrowth(previous, current))}</p>
            </div>
          );
        })}
      </div>
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

      <StorySection number={null} title="Team Production" collapsible sectionId="builder-scorecard-section-01" exportName="Team Production" exportMetadata={exportMetadata}>
        <TeamProductionGrid performance={view.metric.performance} ratings={ratings} />
      </StorySection>

      <StorySection number={null} title="Recruiting" collapsible centerContent sectionId="builder-scorecard-section-02" exportName="Recruiting" exportMetadata={exportMetadata}>
        <RecruitingMetric value={view.metric.recruitsAdded} rating={ratings.recruitsLicensed} />
      </StorySection>

      <StorySection number={null} title="Previous Period Growth" collapsible condensed sectionId="builder-scorecard-section-03" exportName="Previous Period Growth" exportMetadata={exportMetadata}>
        <GrowthTable view={view} rating={ratings.growth} />
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
