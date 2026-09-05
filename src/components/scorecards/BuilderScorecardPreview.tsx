import { ScorecardStars } from "./ScorecardStars";
import type { BuilderPeriodMetric, ScorecardPeriodKind } from "@/lib/scorecards/run";
import type {
  BuilderAgencyPerformance,
  BuilderAgencyValues,
  BuilderPerformanceKey,
} from "@/lib/scorecards/builder-performance";
import {
  createBuilderStarSummary,
  ACTIVE_DIRECT_IP_TIERS,
  builderGrowthPercent,
  type BuilderStarRatings,
  type BuilderStarSummary,
} from "@/lib/scorecards/ratings";
import {
  money,
  ScorecardHeader,
  StarBandLegend,
  StarScale,
  StorySection,
  builderScorecardAreas,
} from "./ProducerScorecardPreview";
import { DownloadGlyph } from "./ScorecardExportControls";
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

function ActiveDirectsChart() {
  const columns = ACTIVE_DIRECT_IP_TIERS.map(tier => tier.label);
  const rows = [5, 4, 3, 2, 1].map(stars => [
    `${stars} Star`, ...ACTIVE_DIRECT_IP_TIERS.map(tier => `${tier.firstStar + stars - 1}${stars === 5 ? "+" : ""}`),
  ]);
  return (
    <li className="scorecard-band-panel min-w-0 rounded-xl p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4"><h4 className="font-semibold text-ink"># Of Active Directs</h4><span className="text-sm text-accent">20%</span></div>
      <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label="Active Directs rating chart">
        <table className="builder-directs-table">
          <thead><tr><th scope="col"><span className="sr-only">Rating</span></th>{columns.map(column => <th key={column} scope="col"><span className="builder-directs-range">{column}</span><span className="builder-directs-unit">IP</span></th>)}</tr></thead>
          <tbody>{rows.map(([rating, ...values]) => <tr key={rating}><th scope="row" aria-label={rating}><ScorecardStars value={Number.parseInt(rating, 10)} decorative /></th>{values.map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </li>
  );
}

function BuilderScorecardHowItWorks({ periodKind }: { periodKind: ScorecardPeriodKind }) {
  const areas = builderScorecardAreas(periodKind);
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
          <ul aria-label="Five Builder rating metrics" className="mt-7 grid grid-cols-1 gap-6">
            {areas.map((area) => (
              area.label === "Active Directs" ? <ActiveDirectsChart key={area.label} /> : <StarBandLegend key={area.label} metric={area} />
            ))}
          </ul>

          <div className="mt-14 max-w-4xl space-y-9 text-base leading-7 text-white sm:mt-16 sm:space-y-10 sm:text-lg sm:leading-8">
            <p>We use a weighted score across these metrics with 20% of your overall score being attributed to your team&apos;s growth percentage, your first leg percentage (Lower is better), your number of active directs, your average issue premium per active writer, and the number of recruits you got licensed during this {periodKind === "monthly" ? "monthly period" : "period"}.</p>
            <p>We also include on here metrics that may be useful for you to see, but aren&apos;t what we use to create your scorecard rating.</p>
            <p>You can download 9:16 or 16:9 screenshots of each section of the scorecard to post online by clicking the <span className="scorecard-inline-icon" role="img" aria-label="portrait download"><DownloadGlyph format="portrait" /></span> or <span className="scorecard-inline-icon" role="img" aria-label="landscape download"><DownloadGlyph format="landscape" /></span> button in the top right.</p>
            <p>Something to keep in mind is that numbers don&apos;t lie! If you don&apos;t like your score, it simply means you got some work to do. If you believe we made an error and the numbers aren&apos;t accurate, tap the &quot;Report a Bug&quot; button in the bottom left.</p>
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
  if (key === "growth") return builderGrowthPercent(metric.teamIpCents, metric.growth.priorTeamIpCents);
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
    <div className="producer-numbers-grid builder-metrics-grid builder-metrics-grid--scored" role="list" aria-label="Builder scored metrics">
      {BUILDER_SCORED_METRICS.map((item) => {
        const rating = ratings[item.ratingKey];
        return (
          <div key={item.key} className="producer-number-card builder-metric-card rounded-xl border border-hairline bg-card px-5 py-5" role="listitem">
            <p className="producer-number-card__label text-sm text-subtle">{item.label}</p>
            <p className="producer-number-card__value builder-metric-value mt-3 font-semibold leading-none tabular-nums text-ink">
              {metricValue(item.key, scoredMetricValue(item.key, metric))}
            </p>
            <p className="builder-metric-stars"><StarScale value={rating} label={item.ratingLabel} /></p>
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
    <div className="producer-numbers-grid builder-metrics-grid builder-metrics-grid--unscored" role="list" aria-label="Builder unscored metrics">
      {BUILDER_UNSCORED_METRICS.map((item) => (
        <div key={item.key} className="producer-number-card builder-metric-card rounded-xl border border-hairline bg-card px-5 py-5" role="listitem">
          <p className="producer-number-card__label text-sm text-subtle">{item.label}</p>
          <p className="producer-number-card__value builder-metric-value mt-3 font-semibold leading-none tabular-nums text-ink">
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
      teamIpCents: view.metric.teamIpCents,
      currentTeamIpCents: view.metric.teamIpCents,
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

      <BuilderScorecardHowItWorks periodKind={view.period.kind} />

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
            { label: "Growth %", value: ratings.growth, metricValue: percent(builderGrowthPercent(view.metric.teamIpCents, view.metric.growth.priorTeamIpCents)) },
            { label: "First Leg %", value: ratings.firstLegPercent, metricValue: metricValue("firstLegPercent", view.metric.firstLegPercent) },
            { label: "Active Directs", value: ratings.activeDirects, metricValue: metricValue("activeWriters", view.metric.activeWriters) },
            { label: "Avg IP / Active Writer", value: ratings.averageIpPerActiveWriter, metricValue: metricValue("averageIpPerWriter", view.metric.averageMonthlyIpPerWriterCents) },
            { label: "Recruits Licensed", value: ratings.recruitsLicensed, metricValue: metricValue("recruits", view.metric.recruitsAdded) },
          ]}
        />
      </StorySection>
    </article>
  );
}
