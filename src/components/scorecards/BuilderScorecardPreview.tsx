import type { BuilderPeriodMetric, ScorecardPeriodKind } from "@/lib/scorecards/run";
import type { BuilderAgencyPerformance, BuilderPerformanceKey } from "@/lib/scorecards/builder-performance";
import {
  builderRankStars,
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
> & { performance: BuilderAgencyPerformance };

const BUILDER_SCORECARD_AREAS = [
  "Team Production",
  "Recruiting",
] as const;

const BUILDER_SCORECARD_LEVELS = [
  { stars: 0, description: "No recorded performance" },
  { stars: 1, description: "Bottom 20% of agencies" },
  { stars: 2, description: "21st–40th percentile" },
  { stars: 3, description: "41st–60th percentile" },
  { stars: 4, description: "61st–80th percentile" },
  { stars: 5, description: "Top 20% of agencies" },
] as const;

type BuilderRatings = Record<BuilderPerformanceKey, StarRating | null>;

function builderRatings(performance: BuilderAgencyPerformance): BuilderRatings {
  return Object.fromEntries(Object.entries(performance).map(([key, metric]) => [
    key,
    metric.value == null ? null : builderRankStars(metric.value, metric.rank),
  ])) as BuilderRatings;
}

function builderStarSummary(ratings: BuilderRatings): BuilderStarSummary | null {
  if (Object.values(ratings).some((rating) => rating == null)) return null;
  return createBuilderStarSummary(ratings as BuilderStarRatings);
}

function agencyPercentileLabel(rating: StarRating | null): string {
  if (rating == null) return "Unavailable";
  return BUILDER_SCORECARD_LEVELS.find((level) => level.stars === rating)?.description ?? "Unavailable";
}

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
            <p>
              We rank your agency against other active agencies in the organization, not against producers.
            </p>
            <p className="mt-6">We then average all 10 ratings to give your agency an overall score:</p>

            <dl className="mx-auto mt-6 max-w-2xl border-y border-hairline">
              {BUILDER_SCORECARD_LEVELS.map((level) => (
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
            <p className="mt-6">
              You can download 9:16 or 16:9 screenshots of each section to post online.
            </p>
            <p className="mt-6 font-semibold text-white">
              If you are not proud to post your numbers online, chances are you should get to work. Numbers don&apos;t lie. If you don&apos;t like your ranking, do something about it!
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

function percent(value: number | null) {
  if (value == null) return "Unavailable";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

function TeamProductionGrid({
  performance,
  ratings,
}: {
  performance: BuilderAgencyPerformance;
  ratings: BuilderRatings;
}) {
  const items: Array<{ key: Exclude<BuilderPerformanceKey, "recruits">; label: string; value: string }> = [
    { key: "activeWriters", label: "Total Active Writers", value: performance.activeWriters.value?.toLocaleString() ?? "Unavailable" },
    { key: "teamDials", label: "Total Team Dials", value: performance.teamDials.value?.toLocaleString() ?? "Unavailable" },
    { key: "teamContacts", label: "Total Team Contacts", value: performance.teamContacts.value?.toLocaleString() ?? "Unavailable" },
    { key: "teamPresentations", label: "Total Team Presentations", value: performance.teamPresentations.value?.toLocaleString() ?? "Unavailable" },
    { key: "teamSales", label: "Total Team Sales", value: performance.teamSales.value?.toLocaleString() ?? "Unavailable" },
    { key: "teamAp", label: "Total Team AP", value: performance.teamAp.value == null ? "Unavailable" : money(performance.teamAp.value) },
    { key: "teamIp", label: "Total Team IP", value: performance.teamIp.value == null ? "Unavailable" : money(performance.teamIp.value) },
    { key: "firstLegPercent", label: "First Leg %", value: performance.firstLegPercent.value == null ? "Unavailable" : `${performance.firstLegPercent.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%` },
    { key: "averageIpPerWriter", label: "Avg IP Per Writer", value: performance.averageIpPerWriter.value == null ? "Unavailable" : money(performance.averageIpPerWriter.value) },
  ];

  return (
    <div className="producer-numbers-grid flex flex-wrap justify-center gap-3" role="list" aria-label="Builder Team Production metrics">
      {items.map((item) => (
        <div key={item.key} className="producer-number-card w-full shrink-0 rounded-xl border border-hairline bg-card px-5 py-5 sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)]" role="listitem">
          <p className="producer-number-card__label text-sm text-subtle">{item.label}</p>
          <p className="producer-number-card__value mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-none tabular-nums text-ink">{item.value}</p>
          {ratings[item.key] != null ? <p className="mt-4"><StarScale value={ratings[item.key]!} label={item.label} /></p> : null}
          <p className="producer-number-card__percentile mt-4 text-sm font-medium leading-5 text-accent">{agencyPercentileLabel(ratings[item.key])}</p>
        </div>
      ))}
    </div>
  );
}

function RecruitingMetric({ performance, rating }: { performance: BuilderAgencyPerformance; rating: StarRating | null }) {
  return (
    <div className="producer-numbers-grid flex justify-center" role="list" aria-label="Builder Recruiting metric">
      <div className="producer-number-card w-full max-w-sm rounded-xl border border-hairline bg-card px-5 py-5" role="listitem">
        <p className="producer-number-card__label text-sm text-subtle">Recruits Entered the Pipeline</p>
        <p className="producer-number-card__value mt-3 text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tabular-nums text-ink">{performance.recruits.value?.toLocaleString() ?? "Unavailable"}</p>
        {rating != null ? <p className="mt-4"><StarScale value={rating} label="Recruiting" /></p> : null}
        <p className="producer-number-card__percentile mt-4 text-sm font-medium leading-5 text-accent">{agencyPercentileLabel(rating)}</p>
      </div>
    </div>
  );
}

function GrowthTable({ view }: { view: BuilderScorecardView }) {
  const { metric, period } = view;
  return (
    <div className="growth-table max-w-5xl border border-hairline">
      <div className="grid grid-cols-[3fr_3fr_2fr] border-b border-hairline text-sm font-medium text-subtle sm:text-base">
        <p className="growth-header-cell px-3 py-4 sm:px-6">{period.previousLabel}</p>
        <p className="growth-header-cell border-l border-hairline px-3 py-4 sm:px-6">{period.label}</p>
        <p className="growth-header-cell border-l border-hairline px-3 py-4 text-right sm:px-6">{metric.growth.comparison.toUpperCase()}</p>
      </div>
      <div className="growth-row grid grid-cols-[3fr_3fr_2fr]">
        <p className="growth-cell px-3 py-5 sm:px-6">
          <span className="growth-title block text-sm font-medium text-subtle sm:text-base">Team IP</span>
          <span className="growth-value mt-2 block text-xl font-semibold tabular-nums text-ink sm:text-3xl">{metric.growth.priorTeamIpCents == null ? "Unavailable" : money(metric.growth.priorTeamIpCents)}</span>
        </p>
        <p className="growth-cell border-l border-hairline px-3 py-5 sm:px-6">
          <span className="growth-title block text-sm font-medium text-subtle sm:text-base">Team IP</span>
          <span className="growth-value mt-2 block text-xl font-semibold tabular-nums text-ink sm:text-3xl">{money(metric.growth.currentTeamIpCents)}</span>
        </p>
        <p className="growth-cell growth-value border-l border-hairline px-3 pb-5 pt-12 text-right text-xl font-semibold tabular-nums text-accent sm:px-6 sm:text-3xl">{percent(metric.growth.percentage)}</p>
      </div>
    </div>
  );
}

export function BuilderScorecardPreview({ view }: { view: BuilderScorecardView }) {
  const ratings = builderRatings(view.metric.performance);
  const summary = builderStarSummary(ratings);
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
        averageStars={summary?.average ?? null}
        totalStars={summary?.total ?? null}
        maximumStars={50}
      />

      <BuilderScorecardHowItWorks />

      <StorySection number={null} title="Team Production" collapsible sectionId="builder-scorecard-section-01" exportName="Team Production" exportMetadata={exportMetadata}>
        <TeamProductionGrid performance={view.metric.performance} ratings={ratings} />
      </StorySection>

      <StorySection number={null} title="Recruiting" collapsible centerContent sectionId="builder-scorecard-section-02" exportName="Recruiting" exportMetadata={exportMetadata}>
        <RecruitingMetric performance={view.metric.performance} rating={ratings.recruits} />
      </StorySection>

      <StorySection number={null} title="Previous Period Growth" collapsible condensed sectionId="builder-scorecard-section-03" exportName="Previous Period Growth" exportMetadata={exportMetadata}>
        <GrowthTable view={view} />
      </StorySection>

      <StorySection number={null} title="Your Scorecard" centerContent centerHeading sectionId="builder-scorecard-section-card" exportName="Your Scorecard" exportMetadata={exportMetadata}>
        <ScorecardBaseballCard
          memberName={view.member.fullName}
          photoUrl={view.member.photoUrl}
          periodLabel={view.period.label}
          scorecardType="Builder"
          averageRating={summary?.average ?? null}
          totalRating={summary?.total ?? null}
          maximumRatingTotal={50}
          ratings={[
            { label: "Total Active Writers", value: ratings.activeWriters },
            { label: "Total Team Dials", value: ratings.teamDials },
            { label: "Total Team Contacts", value: ratings.teamContacts },
            { label: "Total Team Presentations", value: ratings.teamPresentations },
            { label: "Total Team Sales", value: ratings.teamSales },
            { label: "Total Team AP", value: ratings.teamAp },
            { label: "Total Team IP", value: ratings.teamIp },
            { label: "First Leg %", value: ratings.firstLegPercent },
            { label: "Avg IP Per Writer", value: ratings.averageIpPerWriter },
            { label: "Recruiting", value: ratings.recruits },
          ]}
        />
      </StorySection>
    </article>
  );
}
