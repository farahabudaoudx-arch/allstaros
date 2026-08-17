import type { BuilderPeriodMetric, ScorecardPeriodKind } from "@/lib/scorecards/run";
import {
  money,
  OrganizationComparison,
  ScorecardHeader,
  StorySection,
  StoryValue,
} from "./ProducerScorecardPreview";

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
>;

const BUILDER_SCORECARD_AREAS = [
  "Team IP",
  "Team Productivity",
  "Previous Period Growth",
  "Recruiting",
] as const;

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
            As a builder, we create a scorecard for you based on four areas the OS helps you track:
          </p>

          <ul aria-label="Four Builder scorecard areas" className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
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
              Team IP and recruiting are ranked against other active builders in the organization—not against producers. Team Productivity shows the health of your team through active writers, weighted first-leg percentage, and average monthly IP per writer. Previous Period Growth shows how Team IP changed from the prior period.
            </p>
            <p className="mt-6">
              You can download 9:16 or 16:9 screenshots of each section to post online.
            </p>
            <p className="mt-6 font-semibold text-white">
              If you are not proud to post your numbers online, chances are you should get to work. Numbers don&apos;t lie. If you don&apos;t like your ranking, do something about it.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

function rank(rank: { rank: number; population: number } | null) {
  return rank ? `#${rank.rank} of ${rank.population}` : "Unavailable";
}

function percent(value: number | null) {
  if (value == null) return "Unavailable";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

function TeamTrend({ trend }: { trend: BuilderScorecardMetric["trend"] }) {
  if (!trend.length) {
    return <p className="mt-8 text-sm text-mute">No Team IP was reported for this period.</p>;
  }

  return (
    <div className="weekly-trend mt-8 max-w-4xl">
      <p className="scorecard-copy mb-6 text-base font-normal italic text-white sm:text-lg">
        Here&apos;s how team production moved through the period:
      </p>
      <ul className="weekly-trend__bars space-y-4 md:space-y-5" aria-label="Team issued premium by reporting bucket">
        {trend.map((bucket) => (
          <li key={bucket.reportDate} className="weekly-trend__bar-row grid grid-cols-[5.25rem_minmax(0,1fr)_5.5rem] items-center gap-3 md:grid-cols-[8rem_minmax(0,1fr)_7.5rem] md:gap-5">
            <span className="weekly-trend__bar-label text-xs font-medium text-subtle md:text-sm lg:text-base">{bucket.label}</span>
            <span className="weekly-trend__bar-track relative h-3 overflow-hidden rounded-sm bg-card md:h-4">
              <span className="weekly-trend__bar-fill block h-full origin-left rounded-sm bg-accent" style={{ width: `${bucket.share}%` }} />
            </span>
            <span className="weekly-trend__bar-value text-left text-sm font-semibold text-ink tabular-nums md:text-base lg:text-lg">{money(bucket.teamIpCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductivityGrid({ metric }: { metric: BuilderScorecardMetric }) {
  const items = [
    {
      label: "Active Writers",
      value: metric.activeWriters.toLocaleString(),
      detail: "Unique writers with personal IP in the six-report window, including you.",
    },
    {
      label: "Weighted First Leg %",
      value: metric.firstLegPercent == null ? "Unavailable" : `${metric.firstLegPercent.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`,
      detail: metric.firstLegPercent == null ? "No Team IP denominator was available." : "The month-end Gateway MTD share of Team IP.",
    },
    {
      label: "Average Monthly IP per Writer",
      value: metric.averageMonthlyIpPerWriterCents == null ? "Unavailable" : money(metric.averageMonthlyIpPerWriterCents),
      detail: `${money(metric.teamIpCents)} Team IP across ${metric.monthCount} month${metric.monthCount === 1 ? "" : "s"} and ${metric.activeWriters} active writer${metric.activeWriters === 1 ? "" : "s"}.`,
    },
  ];

  return (
    <div className="organization-grid grid max-w-4xl gap-3">
      {items.map((item) => (
        <div key={item.label} className="organization-card grid gap-5 rounded-xl border border-hairline bg-card px-5 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-8 sm:py-7">
          <div>
            <p className="organization-card-label text-base font-medium text-subtle sm:text-lg">{item.label}</p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-mute">{item.detail}</p>
          </div>
          <p className="organization-card-value text-[clamp(3.5rem,9vw,6.5rem)] font-semibold leading-[0.88] tabular-nums tracking-[-0.04em] text-ink sm:text-right">{item.value}</p>
        </div>
      ))}
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
      />

      <BuilderScorecardHowItWorks />

      <StorySection number="01" title="Team Issued Premium" compact sectionId="builder-scorecard-section-01" exportName="01 Team Issued Premium" exportMetadata={exportMetadata}>
        <StoryValue
          intro={`By the end of ${view.period.label}, your team submitted:`}
          introClass="font-normal italic text-white"
          compact
          value={money(view.metric.teamIpCents)}
        />
        <TeamTrend trend={view.metric.trend} />
        {view.metric.teamRank ? (
          <OrganizationComparison items={[{ label: "Team IP", value: money(view.metric.teamIpCents), rank: rank(view.metric.teamRank) }]} />
        ) : (
          <div className="mt-10 max-w-2xl border-l-2 border-accent pl-5">
            <p className="text-2xl font-semibold text-ink">Team Ranking unavailable</p>
            <p className="mt-3 text-sm leading-6 text-subtle">You were not represented by a matched Gateway row in this period. Your Scorecard remains valid.</p>
          </div>
        )}
      </StorySection>

      <StorySection number="02" title="Team Productivity" centerContent sectionId="builder-scorecard-section-02" exportName="02 Team Productivity" exportMetadata={exportMetadata}>
        <ProductivityGrid metric={view.metric} />
      </StorySection>

      <StorySection number="03" title="Previous Period Growth" condensed sectionId="builder-scorecard-section-03" exportName="03 Previous Period Growth" exportMetadata={exportMetadata}>
        <GrowthTable view={view} />
      </StorySection>

      <StorySection number="04" title="Recruiting" sectionId="builder-scorecard-section-04" exportName="04 Recruiting" exportMetadata={exportMetadata}>
        <StoryValue
          intro={`Across your full team in ${view.period.label}, this many recruits entered the pipeline:`}
          introClass="font-normal italic text-white"
          compact
          value={view.metric.recruitsAdded.toLocaleString()}
        />
        <OrganizationComparison items={[{ label: "Recruits Added", value: view.metric.recruitsAdded.toLocaleString(), rank: rank(view.metric.recruitingRank) }]} />
      </StorySection>
    </article>
  );
}
