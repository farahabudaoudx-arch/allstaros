import { describe, expect, it } from "vitest";
import {
  EMPTY_LIVE_EVENT_TRACKER,
  LIVE_LEADERBOARD_FRESHNESS_TARGET_MS,
  LIVE_LEADERBOARD_POLL_MS,
  reconcileLiveDealEvents,
} from "./live-leaderboard-events";

type Event = { id: string; amount: number };

describe("Live Leaderboard polling event reconciliation", () => {
  it("uses a three-second poll within the five-second normal freshness target", () => {
    expect(LIVE_LEADERBOARD_POLL_MS).toBe(3000);
    expect(LIVE_LEADERBOARD_POLL_MS).toBeLessThanOrEqual(LIVE_LEADERBOARD_FRESHNESS_TARGET_MS);
  });

  it("baselines historical events on initial load without reporting them as new", () => {
    const result = reconcileLiveDealEvents(EMPTY_LIVE_EVENT_TRACKER, "2026-09-09", [
      { id: "a", amount: 100 },
      { id: "b", amount: 200 },
    ] satisfies Event[]);
    expect(result.newEvents).toEqual([]);
    expect(result.tracker.seenIds).toEqual(["a", "b"]);
  });

  it("delivers a same-day missed event once after reconnect and ignores repeated delivery", () => {
    const initial = reconcileLiveDealEvents(EMPTY_LIVE_EVENT_TRACKER, "2026-09-09", [{ id: "a", amount: 100 }]);
    const recovered = reconcileLiveDealEvents(initial.tracker, "2026-09-09", [
      { id: "a", amount: 100 },
      { id: "b", amount: 250 },
    ]);
    expect(recovered.newEvents).toEqual([{ id: "b", amount: 250 }]);
    const repeated = reconcileLiveDealEvents(recovered.tracker, "2026-09-09", [
      { id: "a", amount: 100 },
      { id: "b", amount: 250 },
    ]);
    expect(repeated.newEvents).toEqual([]);
  });

  it("treats corrections, voids, and reappearance of the same stable id quietly", () => {
    const initial = reconcileLiveDealEvents(EMPTY_LIVE_EVENT_TRACKER, "2026-09-09", [{ id: "a", amount: 100 }]);
    const corrected = reconcileLiveDealEvents(initial.tracker, "2026-09-09", [{ id: "a", amount: 175 }]);
    expect(corrected.newEvents).toEqual([]);
    const voided = reconcileLiveDealEvents(corrected.tracker, "2026-09-09", []);
    expect(voided.newEvents).toEqual([]);
    const restored = reconcileLiveDealEvents(voided.tracker, "2026-09-09", [{ id: "a", amount: 175 }]);
    expect(restored.newEvents).toEqual([]);
  });

  it("rolls to the new shop day without replaying yesterday and catches new-day deals", () => {
    const initial = reconcileLiveDealEvents(EMPTY_LIVE_EVENT_TRACKER, "2026-09-09", [{ id: "yesterday", amount: 100 }]);
    const rollover = reconcileLiveDealEvents(initial.tracker, "2026-09-10", [
      { id: "today-1", amount: 300 },
      { id: "today-2", amount: 400 },
    ]);
    expect(rollover.rolledOver).toBe(true);
    expect(rollover.newEvents.map((event) => event.id)).toEqual(["today-1", "today-2"]);
    expect(rollover.tracker.seenIds).toEqual(["today-1", "today-2"]);
  });
});
