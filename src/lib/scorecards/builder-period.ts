export type BuilderIpPeriodRow = {
  reportDate: string;
  periodType: "mtd" | "wtd";
  gatewayLabel: string | null;
  teamIpCents: number;
  firstLegPercent: number | null;
};

export type ReconciledBuilderTrendPoint = {
  reportDate: string;
  label: string;
  teamIpCents: number;
  share: number;
};

export type ReconciledMonthlyBuilderTeamIp = {
  teamIpCents: number;
  firstLegPercent: number | null;
  trend: ReconciledBuilderTrendPoint[];
};

function weekNumber(row: BuilderIpPeriodRow) {
  const match = row.gatewayLabel?.match(/\bweek\s+(\d+)\b/i);
  if (!match) {
    throw new Error(`Builder WTD row ${row.reportDate} is missing a numbered Gateway week label.`);
  }

  return Number(match[1]);
}

function inferredReportDate(monthEndReportDate: string, week: number) {
  const [year, month] = monthEndReportDate.split("-").map(Number);
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(week * 7, lastDayOfMonth);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function reconcileMonthlyBuilderTeamIp(
  rows: BuilderIpPeriodRow[],
): ReconciledMonthlyBuilderTeamIp {
  const mtdRows = rows
    .filter((row) => row.periodType === "mtd")
    .sort((left, right) => left.reportDate.localeCompare(right.reportDate));
  const wtdRows = rows.filter((row) => row.periodType === "wtd");

  if (mtdRows.length === 0) {
    throw new Error("Builder Team IP requires an MTD snapshot for the closed month.");
  }
  if (wtdRows.length === 0) {
    throw new Error("Builder Team IP requires WTD rows for the weekly trend.");
  }

  const weeklyValues = new Map<number, { reportDate: string; teamIpCents: number }>();
  for (const row of wtdRows) {
    const week = weekNumber(row);
    if (weeklyValues.has(week)) {
      throw new Error(`Builder Team IP has more than one WTD row for Week ${week}.`);
    }
    weeklyValues.set(week, { reportDate: row.reportDate, teamIpCents: row.teamIpCents });
  }

  let previousCheckpointTotal = 0;
  let previousCheckpointWeek = 0;

  for (const checkpoint of mtdRows) {
    const matchingWtd = wtdRows.find((row) => row.reportDate === checkpoint.reportDate);
    if (!matchingWtd) {
      throw new Error(`Builder MTD checkpoint ${checkpoint.reportDate} has no matching WTD row.`);
    }

    const checkpointWeek = weekNumber(matchingWtd);
    const segmentWeeks = Array.from(
      { length: checkpointWeek - previousCheckpointWeek },
      (_, index) => previousCheckpointWeek + index + 1,
    );
    const missingWeeks = segmentWeeks.filter((week) => !weeklyValues.has(week));
    const knownSegmentTotal = segmentWeeks.reduce(
      (sum, week) => sum + (weeklyValues.get(week)?.teamIpCents ?? 0),
      0,
    );
    const remainder = checkpoint.teamIpCents - previousCheckpointTotal - knownSegmentTotal;

    if (missingWeeks.length > 1) {
      throw new Error(
        `Builder Team IP cannot uniquely reconstruct Weeks ${missingWeeks.join(", ")} from ${checkpoint.reportDate}.`,
      );
    }
    if (missingWeeks.length === 0 && remainder !== 0) {
      throw new Error(`Builder WTD rows do not reconcile to the MTD checkpoint ${checkpoint.reportDate}.`);
    }
    if (missingWeeks.length === 1) {
      if (remainder < 0) {
        throw new Error(`Builder Team IP reconstruction is negative for Week ${missingWeeks[0]}.`);
      }
      weeklyValues.set(missingWeeks[0], {
        reportDate: inferredReportDate(mtdRows.at(-1)!.reportDate, missingWeeks[0]),
        teamIpCents: remainder,
      });
    }

    previousCheckpointTotal = checkpoint.teamIpCents;
    previousCheckpointWeek = checkpointWeek;
  }

  const monthEnd = mtdRows.at(-1)!;
  const reconciledTotal = [...weeklyValues.values()].reduce(
    (sum, week) => sum + week.teamIpCents,
    0,
  );
  if (reconciledTotal !== monthEnd.teamIpCents) {
    throw new Error("Builder weekly Team IP does not reconcile to the month-end MTD total.");
  }

  const maximumWeeklyTeamIp = Math.max(
    ...[...weeklyValues.values()].map((week) => week.teamIpCents),
    0,
  );
  const trend = [...weeklyValues.entries()]
    .sort(([left], [right]) => left - right)
    .map(([week, value]) => ({
      reportDate: value.reportDate,
      label: `Week ${week}`,
      teamIpCents: value.teamIpCents,
      share: maximumWeeklyTeamIp === 0
        ? 0
        : Math.round((value.teamIpCents / maximumWeeklyTeamIp) * 100),
    }));

  return {
    teamIpCents: monthEnd.teamIpCents,
    firstLegPercent: monthEnd.firstLegPercent,
    trend,
  };
}
