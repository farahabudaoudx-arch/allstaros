export const LIVE_LEADERBOARD_POLL_MS = 3_000;
export const LIVE_LEADERBOARD_FRESHNESS_TARGET_MS = 5_000;

export type LiveEventIdentity = { id: string };

export type LiveEventTracker = {
  initialized: boolean;
  shopDay: string | null;
  seenIds: string[];
};

export const EMPTY_LIVE_EVENT_TRACKER: LiveEventTracker = {
  initialized: false,
  shopDay: null,
  seenIds: [],
};

export function reconcileLiveDealEvents<T extends LiveEventIdentity>(
  tracker: LiveEventTracker,
  shopDay: string,
  events: T[],
): { tracker: LiveEventTracker; newEvents: T[]; rolledOver: boolean } {
  const uniqueEvents: T[] = [];
  const currentIds = new Set<string>();
  for (const event of events) {
    if (currentIds.has(event.id)) continue;
    currentIds.add(event.id);
    uniqueEvents.push(event);
  }

  if (!tracker.initialized) {
    return {
      tracker: { initialized: true, shopDay, seenIds: Array.from(currentIds) },
      newEvents: [],
      rolledOver: false,
    };
  }

  const rolledOver = tracker.shopDay !== shopDay;
  const seen = rolledOver ? new Set<string>() : new Set(tracker.seenIds);
  const newEvents = uniqueEvents.filter((event) => !seen.has(event.id));
  for (const id of currentIds) seen.add(id);

  return {
    tracker: { initialized: true, shopDay, seenIds: Array.from(seen) },
    newEvents,
    rolledOver,
  };
}
