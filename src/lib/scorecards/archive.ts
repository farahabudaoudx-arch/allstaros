import type { ScorecardPeriodKind } from "./run";

export type ScorecardArchiveEntry = {
  id: string;
  personId: string;
  memberName: string;
  cardType: "producer" | "builder";
  periodKind: ScorecardPeriodKind;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  overallResult: string;
  revision: number;
  lifecycleStatus: "final" | "corrected";
  finalizedAt: string;
};

export type ScorecardArchiveGroup = {
  key: string;
  label: string;
  entries: ScorecardArchiveEntry[];
};

export function groupScorecardArchive(entries: ScorecardArchiveEntry[]): ScorecardArchiveGroup[] {
  const groups = new Map<string, ScorecardArchiveGroup>();

  for (const entry of [...entries].sort((a, b) => {
    const periodOrder = b.periodStart.localeCompare(a.periodStart);
    if (periodOrder !== 0) return periodOrder;
    const cardOrder = (a.cardType === "producer" ? 0 : 1) - (b.cardType === "producer" ? 0 : 1);
    if (cardOrder !== 0) return cardOrder;
    return b.revision - a.revision;
  })) {
    const key = `${entry.periodKind}:${entry.periodStart}`;
    const group = groups.get(key) ?? { key, label: entry.periodLabel, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  return [...groups.values()];
}
