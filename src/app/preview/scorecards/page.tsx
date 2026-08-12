import { notFound } from "next/navigation";
import protectedFixture from "@/lib/scorecards/fixtures/protected-producer-july-2026.json";
import {
  createMonthlyProducerPreview,
  createProducerOverview,
} from "@/lib/scorecards/lifecycle";
import { ScorecardsPageShell } from "@/components/scorecards/ProducerScorecardPreview";
import { BuilderScorecardPreview, type BuilderScorecardView } from "@/components/scorecards/BuilderScorecardPreview";
import { computeIpLeaderboard } from "@/lib/producer/ip-leaderboard";
import { fetchAllRows } from "@/lib/producer/metrics";
import { rankForTotal } from "@/lib/scorecards/source";
import { createServiceRoleClient } from "@/lib/supabase/server";

const builderViewIdentity = {
  member: { fullName: "Jackson Rapaport", photoUrl: "https://api.allstarlifegroup.com/storage/v1/object/public/headshots/aa7642c5-7b10-473e-ac8f-b9c21f958354.jpg?v=1784920841727" },
  period: { kind: "monthly", label: "July 2026", previousLabel: "June 2026" },
} satisfies Omit<BuilderScorecardView, "metric">;

type TeamIpRow = {
  report_date: string;
  team_ip_cents: number;
  first_leg_percent: number | string | null;
};

type PersonRow = {
  id: string;
  upline_id: string | null;
  status: string;
  is_builder: boolean;
};

type RecruitRow = {
  person_id: string;
};

type WriterRow = {
  person_id: string;
};

function descendantIds(rootId: string, people: PersonRow[]) {
  const descendants = new Set([rootId]);
  let foundAnother = true;

  while (foundAnother) {
    foundAnother = false;
    for (const person of people) {
      if (person.upline_id && descendants.has(person.upline_id) && !descendants.has(person.id)) {
        descendants.add(person.id);
        foundAnother = true;
      }
    }
  }

  return descendants;
}

function growthPercentage(current: number, prior: number) {
  if (prior === 0) return current === 0 ? 0 : 100;
  if (current === 0) return -100;
  return Math.round(((current - prior) / prior) * 1_000) / 10;
}

async function loadLiveBuilderMetric(): Promise<BuilderScorecardView["metric"]> {
  const service = createServiceRoleClient();
  const builderId = protectedFixture.producerId;
  const [leaderboard, currentResult, priorResult, peopleResult, recruitsResult, writerReportDatesResult] = await Promise.all([
    computeIpLeaderboard(service, {
      board: "team",
      period: "custom",
      from: protectedFixture.period.start,
      to: protectedFixture.period.end,
    }),
    service
      .from("producer_issued_premium")
      .select("report_date, team_ip_cents, first_leg_percent")
      .eq("person_id", builderId)
      .eq("period_type", "wtd")
      .gte("report_date", protectedFixture.period.start)
      .lte("report_date", protectedFixture.period.end)
      .order("report_date", { ascending: true }),
    service
      .from("producer_issued_premium")
      .select("team_ip_cents")
      .eq("person_id", builderId)
      .eq("period_type", "wtd")
      .gte("report_date", "2026-06-01")
      .lte("report_date", "2026-06-30"),
    service
      .from("person")
      .select("id, upline_id, status, is_builder"),
    service
      .from("recruit")
      .select("person_id")
      .gte("created_at", "2026-07-01T05:00:00.000Z")
      .lt("created_at", "2026-08-01T05:00:00.000Z"),
    service
      .from("gateway_issued_premium_import")
      .select("report_date")
      .eq("period_type", "wtd")
      .eq("status", "imported")
      .not("report_date", "is", null)
      .lte("report_date", protectedFixture.period.end)
      .order("report_date", { ascending: false })
      .limit(50),
  ]);

  if (currentResult.error) throw new Error(`Unable to load July Builder Team IP: ${currentResult.error.message}`);
  if (priorResult.error) throw new Error(`Unable to load June Builder Team IP: ${priorResult.error.message}`);
  if (peopleResult.error) throw new Error(`Unable to load the Builder population: ${peopleResult.error.message}`);
  if (recruitsResult.error) throw new Error(`Unable to load July recruits: ${recruitsResult.error.message}`);
  if (writerReportDatesResult.error) throw new Error(`Unable to load the active-writer window: ${writerReportDatesResult.error.message}`);

  const member = leaderboard.rows.find((row) => row.person_id === builderId);
  const currentRows = (currentResult.data ?? []) as TeamIpRow[];
  const people = (peopleResult.data ?? []) as PersonRow[];
  const recruits = (recruitsResult.data ?? []) as RecruitRow[];
  const currentTeamIpCents = currentRows.reduce((sum, row) => sum + row.team_ip_cents, 0);
  const priorTeamIpCents = (priorResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.team_ip_cents),
    0,
  );

  if (member && member.team_ip_cents !== currentTeamIpCents) {
    throw new Error("Builder preview Team IP does not match the organization leaderboard source.");
  }

  const teamRank = member
    ? rankForTotal(member.team_ip_cents, leaderboard.rows.map((row) => row.team_ip_cents))
    : null;
  const maximumWeeklyTeamIp = Math.max(...currentRows.map((row) => row.team_ip_cents), 0);
  const weightedFirstLegTotal = currentRows.reduce(
    (sum, row) => sum + row.team_ip_cents * Number(row.first_leg_percent ?? 0),
    0,
  );
  const team = descendantIds(builderId, people);
  const recentReportDates = [...new Set(
    (writerReportDatesResult.data ?? [])
      .map(({ report_date }) => report_date)
      .filter((reportDate): reportDate is string => Boolean(reportDate)),
  )].slice(0, 6);
  const writerRows = recentReportDates.length === 0
    ? []
    : await fetchAllRows<WriterRow>((from, to) =>
      service
        .from("producer_issued_premium")
        .select("person_id")
        .eq("period_type", "wtd")
        .gt("personal_ip_cents", 0)
        .in("person_id", [...team])
        .in("report_date", recentReportDates)
        .order("id")
        .range(from, to),
    );
  const activeWriters = new Set(writerRows.map((row) => row.person_id)).size;
  const activeBuilders = people.filter((person) => person.status === "active" && person.is_builder);
  const recruitTotals = activeBuilders.map((builder) => {
    const builderTeam = descendantIds(builder.id, people);
    builderTeam.delete(builder.id);
    return {
      personId: builder.id,
      value: recruits.filter((recruit) => builderTeam.has(recruit.person_id)).length,
    };
  });
  const memberRecruitTotal = recruitTotals.find(({ personId }) => personId === builderId);
  if (!memberRecruitTotal) throw new Error("Builder preview member is outside the active Builder population.");
  const recruitingRank = rankForTotal(
    memberRecruitTotal.value,
    recruitTotals.map(({ value }) => value),
  );

  return {
    teamIpCents: currentTeamIpCents,
    teamRank,
    teamRankUnavailableReason: teamRank ? null : "not_represented_in_gateway",
    firstLegPercent: currentTeamIpCents === 0 ? null : weightedFirstLegTotal / currentTeamIpCents,
    activeWriters,
    averageMonthlyIpPerWriterCents:
      activeWriters === 0 ? null : Math.round(currentTeamIpCents / activeWriters),
    monthCount: 1,
    growth: {
      comparison: "mom",
      priorTeamIpCents,
      currentTeamIpCents,
      percentage: growthPercentage(currentTeamIpCents, priorTeamIpCents),
    },
    recruitsAdded: memberRecruitTotal.value,
    recruitingRank,
    trend: currentRows.map((row, index) => ({
      reportDate: row.report_date,
      label: `Week ${index + 1}`,
      teamIpCents: row.team_ip_cents,
      share: maximumWeeklyTeamIp === 0
        ? 0
        : Math.round((row.team_ip_cents / maximumWeeklyTeamIp) * 100),
    })),
  };
}

/** Local visual-acceptance route. Production returns 404, and the fixture is
 * anonymized and stripped of personal/client data. The authenticated member
 * experience remains /producer/scorecards. */
export default async function ScorecardsVisualPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const liveBuilderMetric = await loadLiveBuilderMetric();
  const builderView: BuilderScorecardView = {
    ...builderViewIdentity,
    metric: liveBuilderMetric,
  };

  const preview = createMonthlyProducerPreview({
    producerId: protectedFixture.producerId,
    periodStart: protectedFixture.period.start,
    periodEnd: protectedFixture.period.end,
    periodLabel: protectedFixture.period.label,
    reportDates: protectedFixture.reports.map(({ reportDate, label }) => ({ reportDate, label })),
    producerRows: protectedFixture.reports.map(({ reportDate, personalIpCents }) => ({ reportDate, personalIpCents })),
    generatedAt: "2026-08-10T12:00:00.000Z",
  });
  const overview = createProducerOverview({
    fullName: "Jackson Rapaport",
    photoUrl: "https://api.allstarlifegroup.com/storage/v1/object/public/headshots/aa7642c5-7b10-473e-ac8f-b9c21f958354.jpg?v=1784920841727",
    submittedApCents: protectedFixture.expected.submittedApCents,
    priorSubmittedApCents: protectedFixture.expected.priorSubmittedApCents,
    currentIssuedIpCents: protectedFixture.expected.totalIssuedIpCents,
    priorIssuedIpCents: protectedFixture.expected.priorMonthIpCents,
    rank: {
      rank: protectedFixture.expected.rank,
      population: protectedFixture.expected.population,
      percentile: protectedFixture.expected.percentile,
      movement: null,
    },
    organizationRanks: Object.fromEntries(
      Object.entries(protectedFixture.expected.organizationRanks).map(([metric, rank]) => [
        metric,
        { rank, population: protectedFixture.expected.population },
      ]),
    ) as Parameters<typeof createProducerOverview>[0]["organizationRanks"],
    activityRows: protectedFixture.expected.activityRows,
    priorActivityRows: protectedFixture.expected.priorActivityRows,
    expectedWorkingDates: protectedFixture.expected.expectedWorkingDates,
  });

  return (
    <div className="min-h-dvh bg-background text-ink">
      <ScorecardsPageShell preview={preview} overview={overview} />
      <main className="mx-auto w-full max-w-6xl px-5 pb-12 md:px-10">
        <BuilderScorecardPreview view={builderView} />
      </main>
    </div>
  );
}
