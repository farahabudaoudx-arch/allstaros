const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function sixWeekWindowStart(periodEnd: string): string {
  if (!DATE_ONLY.test(periodEnd)) throw new Error("Active Directs period end must be YYYY-MM-DD.");
  const end = new Date(`${periodEnd}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== periodEnd) {
    throw new Error("Active Directs period end must be a valid calendar date.");
  }
  end.setUTCDate(end.getUTCDate() - 41);
  return end.toISOString().slice(0, 10);
}

export function isInSixWeekWindow(reportDate: string, periodEnd: string): boolean {
  if (!DATE_ONLY.test(reportDate)) return false;
  const start = sixWeekWindowStart(periodEnd);
  return reportDate >= start && reportDate <= periodEnd;
}

/** A scoped week ordinal identifies a report, not a calendar date. Older
 * reports without a provider date are decidable only when their entire covered
 * month is inside or outside the window. null means more source evidence is needed. */
export function gatewayActiveDirectWindow(report: {
  reportDate: string;
  scorecardPeriodStart?: string | null;
  scorecardPeriodEnd?: string | null;
  gatewayWeekStart?: string | null;
}, periodEnd: string): boolean | null {
  if (!report.scorecardPeriodStart) return isInSixWeekWindow(report.reportDate, periodEnd);
  const start = sixWeekWindowStart(periodEnd);
  if (report.gatewayWeekStart != null) {
    const date = new Date(`${report.gatewayWeekStart}T00:00:00Z`);
    if (!DATE_ONLY.test(report.gatewayWeekStart) || Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== report.gatewayWeekStart) return null;
    return report.gatewayWeekStart >= start && report.gatewayWeekStart <= periodEnd;
  }
  if (!report.scorecardPeriodEnd) return null;
  if (report.scorecardPeriodEnd < start || report.scorecardPeriodStart > periodEnd) return false;
  if (report.scorecardPeriodStart >= start && report.scorecardPeriodEnd <= periodEnd) return true;
  return null;
}

export type ActiveDirectPerson = {
  id: string;
  uplineId: string | null;
};

export function countActiveDirects(args: {
  builderId: string;
  people: ActiveDirectPerson[];
  activePersonIds: Iterable<string>;
  recentWriterIds: Iterable<string>;
}): number {
  const activePersonIds = new Set(args.activePersonIds);
  const recentWriterIds = new Set(args.recentWriterIds);
  const counted = new Set<string>();

  for (const person of args.people) {
    if (person.id === args.builderId) continue;
    if (person.uplineId !== args.builderId) continue;
    if (!activePersonIds.has(person.id)) continue;
    if (!recentWriterIds.has(person.id)) continue;
    counted.add(person.id);
  }

  return counted.size;
}
