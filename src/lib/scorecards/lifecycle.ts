export const SCORECARD_CARD_TYPES = ["producer", "builder"] as const;
export const SCORECARD_PERIOD_KINDS = ["monthly", "quarterly", "annual"] as const;
export const SCORECARD_LIFECYCLE_STATUSES = [
  "in_progress",
  "waiting_for_data",
  "final",
  "corrected",
] as const;

export type ScorecardCardType = (typeof SCORECARD_CARD_TYPES)[number];
export type ScorecardPeriodKind = (typeof SCORECARD_PERIOD_KINDS)[number];
export type ScorecardLifecycleStatus = (typeof SCORECARD_LIFECYCLE_STATUSES)[number];
export type IssuanceStatus = "green" | "blue" | "red";

export const ISSUANCE_THRESHOLDS = {
  greenMinimumCents: 3_000_000,
  blueMinimumCents: 1_500_000,
} as const;

const greenThresholdDollars = ISSUANCE_THRESHOLDS.greenMinimumCents / 100;
const blueThresholdDollars = ISSUANCE_THRESHOLDS.blueMinimumCents / 100;
const blueMaximumDollars = (ISSUANCE_THRESHOLDS.greenMinimumCents - 1) / 100;

export const ISSUANCE_THRESHOLD_SUMMARY = `Green $${greenThresholdDollars / 1_000}k+ · Blue $${blueThresholdDollars / 1_000}k–$${blueMaximumDollars.toLocaleString("en-US")} · Red below $${blueThresholdDollars / 1_000}k`;

export type MonthlyProducerSource = {
  producerId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  reportDates: Array<{ reportDate: string; label: string }>;
  producerRows: Array<{ reportDate: string; personalIpCents: number }>;
  generatedAt: string;
};

export type ProducerScorecardWeek = {
  reportDate: string;
  label: string;
  personalIpCents: number;
};

export type ProducerActivityTotals = {
  leads: number;
  dials: number;
  contacts: number;
  appointments: number;
  presentations: number;
  sales: number;
};

export type ProducerActivityRow = {
  entryDate: string;
  leads: number | null;
  dials: number | null;
  contacts: number | null;
  appointments: number | null;
  presentations: number | null;
  sales: number | null;
};

export type ScorecardScheduleFact = {
  factDate: string;
  expectedWorkingDay: boolean;
  trackerSubmitted: boolean;
};

export function createScorecardScheduleFacts(input: {
  periodStart: string;
  periodEnd: string;
  expectedWorkingDates: string[];
  activityRows: ProducerActivityRow[];
}): ScorecardScheduleFact[] {
  const expectedDates = new Set(input.expectedWorkingDates);
  const submittedDates = new Set(input.activityRows.map((row) => row.entryDate));
  const facts: ScorecardScheduleFact[] = [];
  const cursor = new Date(`${input.periodStart}T00:00:00Z`);
  const end = new Date(`${input.periodEnd}T00:00:00Z`);

  while (cursor <= end) {
    const factDate = cursor.toISOString().slice(0, 10);
    facts.push({
      factDate,
      expectedWorkingDay: expectedDates.has(factDate),
      trackerSubmitted: submittedDates.has(factDate),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return facts;
}

export type ProducerOverview = {
  producer: { fullName: string; photoUrl: string | null; role: "Producer" };
  submittedApCents: number | null;
  priorSubmittedApCents: number | null;
  priorIssuedIpCents: number | null;
  priorActivityTotals: ProducerActivityTotals | null;
  growth:
    | { kind: "new_baseline"; percentage: null }
    | { kind: "percentage"; percentage: number };
  rank: { rank: number | null; population: number; percentile: number; movement: number | null };
  organizationRanks: {
    submittedAp: { rank: number | null; population: number };
    leadSpend: { rank: number | null; population: number };
    dials: { rank: number | null; population: number };
    contacts: { rank: number | null; population: number };
    presentations: { rank: number | null; population: number };
    sales: { rank: number | null; population: number };
    trackingConsistency: { rank: number | null; population: number };
  };
  activity: {
    availability: "tracked" | "partial" | "missing";
    trackedDays: number;
    leadSpendCents: number;
    loggedDates: string[];
    expectedDates: string[] | null;
    consistency: { loggedDays: number; expectedDays: number; percentage: number } | null;
    totals: ProducerActivityTotals | null;
    perTrackedDay: ProducerActivityTotals | null;
  };
};

export function createProducerOverview(input: {
  fullName: string;
  photoUrl: string | null;
  submittedApCents: number | null;
  leadSpendCents: number;
  priorSubmittedApCents?: number | null;
  currentIssuedIpCents: number;
  priorIssuedIpCents: number | null;
  rank: ProducerOverview["rank"];
  organizationRanks: ProducerOverview["organizationRanks"];
  activityRows: ProducerActivityRow[];
  priorActivityRows?: ProducerActivityRow[];
  expectedWorkingDates: string[] | null;
}): ProducerOverview {
  const trackedDays = input.activityRows.length;
  const hasIncompleteRow = input.activityRows.some((row) =>
    [row.leads, row.dials, row.contacts, row.appointments, row.presentations, row.sales]
      .some((value) => value == null),
  );
  const availability = trackedDays === 0 ? "missing" : hasIncompleteRow ? "partial" : "tracked";
  const totals = trackedDays && !hasIncompleteRow
    ? input.activityRows.reduce<ProducerActivityTotals>(
        (sum, row) => ({
          leads: sum.leads + row.leads!,
          dials: sum.dials + row.dials!,
          contacts: sum.contacts + row.contacts!,
          appointments: sum.appointments + row.appointments!,
          presentations: sum.presentations + row.presentations!,
          sales: sum.sales + row.sales!,
        }),
        { leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 },
      )
    : null;
  const priorRows = input.priorActivityRows ?? [];
  const priorHasIncompleteRow = priorRows.some((row) =>
    [row.leads, row.dials, row.contacts, row.appointments, row.presentations, row.sales]
      .some((value) => value == null),
  );
  const priorActivityTotals = priorRows.length && !priorHasIncompleteRow
    ? priorRows.reduce<ProducerActivityTotals>(
        (sum, row) => ({
          leads: sum.leads + row.leads!,
          dials: sum.dials + row.dials!,
          contacts: sum.contacts + row.contacts!,
          appointments: sum.appointments + row.appointments!,
          presentations: sum.presentations + row.presentations!,
          sales: sum.sales + row.sales!,
        }),
        { leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 },
      )
    : null;
  const perTrackedDay = totals
    ? Object.fromEntries(
        Object.entries(totals).map(([key, value]) => [
          key,
          Math.round((value / trackedDays) * 10) / 10,
        ]),
      ) as ProducerActivityTotals
    : null;
  const expectedDates = input.expectedWorkingDates == null ? null : new Set(input.expectedWorkingDates);
  const loggedExpectedDays = expectedDates
    ? new Set(input.activityRows.map((row) => row.entryDate).filter((date) => expectedDates.has(date))).size
    : 0;
  const consistency =
    expectedDates == null
      ? null
      : {
          loggedDays: loggedExpectedDays,
          expectedDays: expectedDates.size,
          percentage:
            expectedDates.size > 0
              ? Math.round((loggedExpectedDays / expectedDates.size) * 100)
              : 0,
        };
  const growth =
    input.priorIssuedIpCents == null || input.priorIssuedIpCents === 0
      ? ({ kind: "new_baseline", percentage: null } as const)
      : ({
          kind: "percentage",
          percentage:
            Math.round(
              ((input.currentIssuedIpCents - input.priorIssuedIpCents) /
                input.priorIssuedIpCents) *
                1_000,
            ) / 10,
        } as const);

  return {
    producer: { fullName: input.fullName, photoUrl: input.photoUrl, role: "Producer" },
    submittedApCents: input.submittedApCents,
    priorSubmittedApCents: input.priorSubmittedApCents ?? null,
    priorIssuedIpCents: input.priorIssuedIpCents,
    priorActivityTotals,
    growth,
    rank: input.rank,
    organizationRanks: input.organizationRanks,
    activity: {
      availability,
      trackedDays,
      leadSpendCents: input.leadSpendCents,
      loggedDates: [...new Set(input.activityRows.map((row) => row.entryDate))].sort(),
      expectedDates: input.expectedWorkingDates ? [...new Set(input.expectedWorkingDates)].sort() : null,
      consistency,
      totals,
      perTrackedDay,
    },
  };
}

export type MonthlyProducerPreview = {
  cardType: "producer";
  periodKind: "monthly";
  lifecycleStatus: "in_progress";
  producerId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  title: string;
  weeklyReports: ProducerScorecardWeek[];
  totalIssuedIpCents: number;
  averageWeeklyIpCents: number;
  issuanceStatus: IssuanceStatus;
  hasProduction: boolean;
  emptyMessage: string | null;
  generatedAt: string;
  sourceCoverage: {
    source: "gateway";
    reportCount: number;
    completeThrough: string | null;
  };
};

export function issuanceStatusForMonthlyIp(monthlyIssuedIpCents: number): IssuanceStatus {
  if (!Number.isInteger(monthlyIssuedIpCents) || monthlyIssuedIpCents < 0) {
    throw new Error("Monthly issued premium must be non-negative integer cents.");
  }
  if (monthlyIssuedIpCents >= ISSUANCE_THRESHOLDS.greenMinimumCents) return "green";
  if (monthlyIssuedIpCents >= ISSUANCE_THRESHOLDS.blueMinimumCents) return "blue";
  return "red";
}

/**
 * Primary Scorecard lifecycle boundary. Preview generation is intentionally
 * pure: callers provide a captured source view, so finalized snapshots can use
 * the same contract without ever querying mutable production data in tests.
 */
export function createMonthlyProducerPreview(
  source: MonthlyProducerSource,
): MonthlyProducerPreview {
  const reportDateSet = new Set<string>();
  for (const report of source.reportDates) {
    if (reportDateSet.has(report.reportDate)) {
      throw new Error(`Duplicate Gateway report date: ${report.reportDate}`);
    }
    reportDateSet.add(report.reportDate);
  }

  const amountByDate = new Map<string, number>();
  for (const row of source.producerRows) {
    if (!reportDateSet.has(row.reportDate)) continue;
    if (!Number.isInteger(row.personalIpCents) || row.personalIpCents < 0) {
      throw new Error("Gateway issued premium must be non-negative integer cents.");
    }
    amountByDate.set(row.reportDate, row.personalIpCents);
  }

  const weeklyReports = [...source.reportDates]
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
    .map((report) => {
      const personalIpCents = amountByDate.get(report.reportDate) ?? 0;
      return {
        ...report,
        personalIpCents,
      };
    });

  const totalIssuedIpCents = weeklyReports.reduce(
    (total, report) => total + report.personalIpCents,
    0,
  );
  const averageWeeklyIpCents = weeklyReports.length
    ? Math.round(totalIssuedIpCents / weeklyReports.length)
    : 0;
  const hasProduction = totalIssuedIpCents > 0;

  return {
    cardType: "producer",
    periodKind: "monthly",
    lifecycleStatus: "in_progress",
    producerId: source.producerId,
    periodStart: source.periodStart,
    periodEnd: source.periodEnd,
    periodLabel: source.periodLabel,
    title: `${source.periodLabel} Producer Scorecard`,
    weeklyReports,
    totalIssuedIpCents,
    averageWeeklyIpCents,
    issuanceStatus: issuanceStatusForMonthlyIp(totalIssuedIpCents),
    hasProduction,
    emptyMessage: hasProduction
      ? null
      : "This month is your starting point. Your weekly Gateway reports will appear here as production issues.",
    generatedAt: source.generatedAt,
    sourceCoverage: {
      source: "gateway",
      reportCount: weeklyReports.length,
      completeThrough: weeklyReports.at(-1)?.reportDate ?? null,
    },
  };
}
