export const SCORECARD_CARD_TYPES = ["producer", "builder"] as const;
export const SCORECARD_PERIOD_KINDS = ["monthly", "quarterly", "yearly"] as const;
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
  issuanceStatus: IssuanceStatus;
};

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

export function issuanceStatusForAverage(averageWeeklyIpCents: number): IssuanceStatus {
  if (!Number.isInteger(averageWeeklyIpCents) || averageWeeklyIpCents < 0) {
    throw new Error("Average weekly issued premium must be non-negative integer cents.");
  }
  if (averageWeeklyIpCents >= ISSUANCE_THRESHOLDS.greenMinimumCents) return "green";
  if (averageWeeklyIpCents >= ISSUANCE_THRESHOLDS.blueMinimumCents) return "blue";
  return "red";
}

function issuanceStatusForTotal(totalIssuedIpCents: number, reportCount: number): IssuanceStatus {
  if (reportCount <= 0) return "red";
  if (totalIssuedIpCents >= ISSUANCE_THRESHOLDS.greenMinimumCents * reportCount) {
    return "green";
  }
  if (totalIssuedIpCents >= ISSUANCE_THRESHOLDS.blueMinimumCents * reportCount) {
    return "blue";
  }
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
        issuanceStatus: issuanceStatusForAverage(personalIpCents),
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
    // Classify from the exact ratio. The rounded integer is presentation data;
    // rounding 14,999.9975 up must never turn a Red result into Blue.
    issuanceStatus: issuanceStatusForTotal(totalIssuedIpCents, weeklyReports.length),
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
