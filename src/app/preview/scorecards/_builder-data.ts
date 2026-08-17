import "server-only";

import type { BuilderScorecardView } from "@/components/scorecards/BuilderScorecardPreview";
import { isLeaderboardExcluded } from "@/lib/producer/leaderboardExclusions";
import { computeLeaderboard, fetchAllRows } from "@/lib/producer/metrics";
import { reconcileMonthlyBuilderTeamIp } from "@/lib/scorecards/builder-period";
import { createBuilderAgencyPerformance } from "@/lib/scorecards/builder-performance";
import protectedFixture from "@/lib/scorecards/fixtures/protected-producer-july-2026.json";
import { createServiceRoleClient } from "@/lib/supabase/server";

const builderViewIdentity = {
  member: {
    fullName: "Ronny Bucica",
    photoUrl: "https://api.allstarlifegroup.com/storage/v1/object/public/headshots/ce7623c3-838e-4a3c-9750-583a05e6f7b2.jpg?v=1784935412655",
  },
  period: { kind: "monthly", label: "July 2026", previousLabel: "June 2026" },
} satisfies Omit<BuilderScorecardView, "metric">;

type TeamIpRow = {
  report_date: string;
  period_type: "mtd" | "wtd";
  gateway_label: string | null;
  team_ip_cents: number;
  first_leg_percent: number | string | null;
};

type TeamLeaderboardRow = {
  person_id: string;
  team_ip_cents: number;
  first_leg_percent: number | string | null;
};

type PersonRow = {
  id: string;
  upline_id: string | null;
  status: string;
  is_builder: boolean;
};

type RecruitRow = { person_id: string };
type WriterRow = { id: string; person_id: string };

function growthPercentage(current: number, prior: number) {
  if (prior === 0) return current === 0 ? 0 : 100;
  if (current === 0) return -100;
  return Math.round(((current - prior) / prior) * 1_000) / 10;
}

async function loadLiveBuilderMetric(): Promise<BuilderScorecardView["metric"]> {
  const service = createServiceRoleClient();
  const builderId = "ce7623c3-838e-4a3c-9750-583a05e6f7b2";
  const [currentResult, priorResult, leaderboardResult, peopleResult, recruitsResult, writerReportDatesResult, productionLeaderboard] = await Promise.all([
    service
      .from("producer_issued_premium")
      .select("report_date, period_type, gateway_label, team_ip_cents, first_leg_percent")
      .eq("person_id", builderId)
      .in("period_type", ["mtd", "wtd"])
      .gte("report_date", protectedFixture.period.start)
      .lte("report_date", protectedFixture.period.end)
      .order("report_date", { ascending: true })
      .order("period_type", { ascending: true }),
    service
      .from("producer_issued_premium")
      .select("team_ip_cents")
      .eq("person_id", builderId)
      .eq("period_type", "mtd")
      .gte("report_date", "2026-06-01")
      .lte("report_date", "2026-06-30")
      .order("report_date", { ascending: false })
      .limit(1),
    service
      .from("producer_issued_premium")
      .select("person_id, team_ip_cents, first_leg_percent")
      .eq("period_type", "mtd")
      .eq("report_date", protectedFixture.period.end),
    service.from("person").select("id, upline_id, status, is_builder"),
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
    computeLeaderboard(service, {
      rangeKey: "custom",
      tz: "America/Chicago",
      from: protectedFixture.period.start,
      to: protectedFixture.period.end,
      metric: "ap_cents",
    }),
  ]);

  if (currentResult.error) throw new Error(`Unable to load July Builder Team IP: ${currentResult.error.message}`);
  if (priorResult.error) throw new Error(`Unable to load June Builder Team IP: ${priorResult.error.message}`);
  if (leaderboardResult.error) throw new Error(`Unable to load the July Builder leaderboard: ${leaderboardResult.error.message}`);
  if (peopleResult.error) throw new Error(`Unable to load the Builder population: ${peopleResult.error.message}`);
  if (recruitsResult.error) throw new Error(`Unable to load July recruits: ${recruitsResult.error.message}`);
  if (writerReportDatesResult.error) throw new Error(`Unable to load the active-writer window: ${writerReportDatesResult.error.message}`);

  const currentRows = (currentResult.data ?? []) as TeamIpRow[];
  const people = (peopleResult.data ?? []) as PersonRow[];
  const recruits = (recruitsResult.data ?? []) as RecruitRow[];
  const reconciledTeamIp = reconcileMonthlyBuilderTeamIp(currentRows.map((row) => ({
    reportDate: row.report_date,
    periodType: row.period_type,
    gatewayLabel: row.gateway_label,
    teamIpCents: Number(row.team_ip_cents),
    firstLegPercent: row.first_leg_percent == null ? null : Number(row.first_leg_percent),
  })));
  const currentTeamIpCents = reconciledTeamIp.teamIpCents;
  const priorTeamIpCents = Number(priorResult.data?.[0]?.team_ip_cents ?? 0);
  const activeBuilders = people.filter((person) =>
    person.status === "active" && person.is_builder && !isLeaderboardExcluded(person.id)
  );
  const activeBuilderIds = new Set(activeBuilders.map((person) => person.id));
  const leaderboard = ((leaderboardResult.data ?? []) as TeamLeaderboardRow[])
    .filter((row) => activeBuilderIds.has(row.person_id));
  const member = leaderboard.find((row) => row.person_id === builderId);

  if (member && Number(member.team_ip_cents) !== currentTeamIpCents) {
    throw new Error("Builder month-end Team IP does not match the organization leaderboard source.");
  }

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
        .select("id, person_id")
        .eq("period_type", "wtd")
        .gt("personal_ip_cents", 0)
        .in("report_date", recentReportDates)
        .order("id")
        .range(from, to),
    );
  const agencyPerformance = createBuilderAgencyPerformance({
    people: people.map((person) => ({ id: person.id, uplineId: person.upline_id })),
    eligibleBuilderIds: activeBuilders.map((person) => person.id),
    gatewayRows: leaderboard.map((row) => ({
      builderId: row.person_id,
      teamIpCents: Number(row.team_ip_cents),
      firstLegPercent: row.first_leg_percent == null ? null : Number(row.first_leg_percent),
    })),
    activeWriterIds: writerRows.map((row) => row.person_id),
    personProduction: productionLeaderboard.rows.map((row) => ({
      personId: row.person_id,
      dials: row.dials,
      contacts: row.contacts,
      presentations: row.presentations,
      sales: row.sales,
      apCents: row.ap_cents,
    })),
    recruitPersonIds: recruits.map((recruit) => recruit.person_id),
  });
  const performance = agencyPerformance.get(builderId);
  if (!performance) throw new Error("Builder preview member is outside the active Builder population.");
  const teamRank = performance.teamIp.rank.rank == null
    ? null
    : { rank: performance.teamIp.rank.rank, population: performance.teamIp.rank.population };
  const recruitingRank = {
    rank: performance.recruits.rank.rank ?? Math.max(1, performance.recruits.rank.population),
    population: performance.recruits.rank.population,
  };

  return {
    teamIpCents: currentTeamIpCents,
    teamRank,
    teamRankUnavailableReason: teamRank ? null : "not_represented_in_gateway",
    firstLegPercent: performance.firstLegPercent.value,
    activeWriters: performance.activeWriters.value ?? 0,
    averageMonthlyIpPerWriterCents: performance.averageIpPerWriter.value,
    monthCount: 1,
    growth: {
      comparison: "mom",
      priorTeamIpCents,
      currentTeamIpCents,
      percentage: growthPercentage(currentTeamIpCents, priorTeamIpCents),
    },
    recruitsAdded: performance.recruits.value ?? 0,
    recruitingRank,
    trend: reconciledTeamIp.trend,
    performance,
  };
}

export async function loadLiveBuilderView(): Promise<BuilderScorecardView> {
  return {
    ...builderViewIdentity,
    metric: await loadLiveBuilderMetric(),
  };
}
