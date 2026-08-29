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
