import { describe, expect, it } from "vitest";
import { LIVE_CELEBRATION_MS, mergeLiveCelebrationQueue } from "./live-leaderboard-celebrations";

describe("Live Leaderboard celebration queue", () => {
  it("keeps each celebration on screen for approximately five seconds", () => {
    expect(LIVE_CELEBRATION_MS).toBe(5000);
  });

  it("keeps burst order without a queue cap", () => {
    const burst = Array.from({ length: 250 }, (_, index) => ({ id: "deal-" + index }));
    const queue = mergeLiveCelebrationQueue([{ id: "existing" }], burst, false);
    expect(queue).toHaveLength(251);
    expect(queue[0]?.id).toBe("existing");
    expect(queue.at(-1)?.id).toBe("deal-249");
  });

  it("drops yesterday queued work at shop rollover and keeps only new-day events", () => {
    const queue = mergeLiveCelebrationQueue(
      [{ id: "yesterday-1" }, { id: "yesterday-2" }],
      [{ id: "today-1" }, { id: "today-2" }],
      true,
    );
    expect(queue.map((event) => event.id)).toEqual(["today-1", "today-2"]);
  });
});
