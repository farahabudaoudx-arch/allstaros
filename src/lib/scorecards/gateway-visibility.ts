import {
  EMPTY_GATEWAY_CONNECTION_STATE,
  type GatewayConnectionState,
} from "@/lib/gateway/connection-types";
import type { ScorecardArchiveEntry } from "./archive";
import type { ScorecardPeriod } from "./period";

/**
 * Published Scorecards are account artifacts, not a live Gateway-connection
 * view. A missing personal Gateway row scores issued paid as zero, but it does
 * not hide an otherwise-authorized published card.
 */
export function scorecardLookbackVisible(_state: GatewayConnectionState) {
  return true;
}

export function shouldAnnounceUncreatedScorecard(args: {
  state: GatewayConnectionState;
  hasPublishedForDuePeriod: boolean;
}) {
  if (args.state.connected || args.state.status === "unavailable") return false;
  if (!args.state.everConnected) return false;
  return !args.hasPublishedForDuePeriod;
}

export function filterScorecardArchiveByGatewayConnection(
  entries: ScorecardArchiveEntry[],
  states: Map<string, GatewayConnectionState>,
): ScorecardArchiveEntry[] {
  return entries.filter((entry) => {
    const state = states.get(entry.personId) ?? EMPTY_GATEWAY_CONNECTION_STATE;
    return scorecardLookbackVisible(state);
  });
}

export type UncreatedScorecardPlaceholder = {
  personId: string;
  memberName: string;
  cardType: ScorecardArchiveEntry["cardType"];
  periodKind: ScorecardPeriod["kind"];
  periodStart: string;
  periodLabel: string;
};

/**
 * Placeholders only for people who already have published cards (so they are in
 * the archive) and are missing the due closed period after a disconnect.
 * Never-connected Jake does not get a $0 / fake new-period card.
 */
export function uncreatedScorecardPlaceholders(args: {
  duePeriod: ScorecardPeriod;
  entries: ScorecardArchiveEntry[];
  states: Map<string, GatewayConnectionState>;
}): UncreatedScorecardPlaceholder[] {
  const people = new Map<string, { memberName: string; cardTypes: Set<ScorecardArchiveEntry["cardType"]> }>();
  for (const entry of args.entries) {
    const existing = people.get(entry.personId);
    if (existing) {
      existing.cardTypes.add(entry.cardType);
      continue;
    }
    people.set(entry.personId, {
      memberName: entry.memberName,
      cardTypes: new Set([entry.cardType]),
    });
  }

  const placeholders: UncreatedScorecardPlaceholder[] = [];
  for (const [personId, person] of people) {
    const state = args.states.get(personId) ?? EMPTY_GATEWAY_CONNECTION_STATE;
    for (const cardType of person.cardTypes) {
      const hasPublishedForDuePeriod = args.entries.some(
        (entry) =>
          entry.personId === personId &&
          entry.cardType === cardType &&
          entry.periodKind === args.duePeriod.kind &&
          entry.periodStart === args.duePeriod.start,
      );
      if (!shouldAnnounceUncreatedScorecard({ state, hasPublishedForDuePeriod })) continue;
      placeholders.push({
        personId,
        memberName: person.memberName,
        cardType,
        periodKind: args.duePeriod.kind,
        periodStart: args.duePeriod.start,
        periodLabel: args.duePeriod.label,
      });
    }
  }
  return placeholders;
}
