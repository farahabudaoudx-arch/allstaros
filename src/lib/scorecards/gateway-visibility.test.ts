import { describe, expect, it } from "vitest";
import {
  EMPTY_GATEWAY_CONNECTION_STATE,
  UNAVAILABLE_GATEWAY_CONNECTION_STATE,
  type GatewayConnectionState,
} from "@/lib/gateway/connection-types";
import type { ScorecardArchiveEntry } from "./archive";
import {
  filterScorecardArchiveByGatewayConnection,
  scorecardLookbackVisible,
  shouldAnnounceUncreatedScorecard,
  uncreatedScorecardPlaceholders,
} from "./gateway-visibility";
import type { ScorecardPeriod } from "./period";

const duePeriod: ScorecardPeriod = {
  kind: "monthly",
  start: "2026-08-01",
  end: "2026-08-31",
  label: "August 2026",
};

function state(overrides: Partial<GatewayConnectionState>): GatewayConnectionState {
  return { ...EMPTY_GATEWAY_CONNECTION_STATE, ...overrides };
}

function entry(overrides: Partial<ScorecardArchiveEntry>): ScorecardArchiveEntry {
  return {
    id: "card-1",
    personId: "jake",
    memberName: "Jake",
    cardType: "producer",
    periodKind: "monthly",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    periodLabel: "June 2026",
    overallResult: "3.00 / 5",
    revision: 1,
    lifecycleStatus: "final",
    finalizedAt: "2026-07-02T12:00:00Z",
    ...overrides,
  };
}

describe("Scorecard Gateway visibility gates", () => {
  it("hides look-back for never-connected people and keeps published cards after disconnect", () => {
    expect(scorecardLookbackVisible(EMPTY_GATEWAY_CONNECTION_STATE)).toBe(false);
    expect(scorecardLookbackVisible(state({ status: "disconnected", everConnected: true }))).toBe(true);
    expect(scorecardLookbackVisible(state({ status: "connected", connected: true, everConnected: true }))).toBe(true);
    expect(scorecardLookbackVisible(UNAVAILABLE_GATEWAY_CONNECTION_STATE)).toBe(true);
  });

  it("drops leftover agency snapshots for never-connected people without touching connected history", () => {
    const jake = entry({ personId: "jake", memberName: "Jake" });
    const sarah = entry({
      id: "card-2",
      personId: "sarah",
      memberName: "Sarah",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
    });
    const visible = filterScorecardArchiveByGatewayConnection(
      [jake, sarah],
      new Map([
        ["jake", EMPTY_GATEWAY_CONNECTION_STATE],
        ["sarah", state({ status: "disconnected", everConnected: true })],
      ]),
    );
    expect(visible.map((row) => row.personId)).toEqual(["sarah"]);
  });

  it("announces an uncreated due card after disconnect, not for never-connected people", () => {
    expect(shouldAnnounceUncreatedScorecard({
      state: EMPTY_GATEWAY_CONNECTION_STATE,
      hasPublishedForDuePeriod: false,
    })).toBe(false);
    expect(shouldAnnounceUncreatedScorecard({
      state: state({ status: "connected", connected: true, everConnected: true }),
      hasPublishedForDuePeriod: false,
    })).toBe(false);
    expect(shouldAnnounceUncreatedScorecard({
      state: state({ status: "disconnected", everConnected: true }),
      hasPublishedForDuePeriod: true,
    })).toBe(false);
    expect(shouldAnnounceUncreatedScorecard({
      state: state({ status: "disconnected", everConnected: true }),
      hasPublishedForDuePeriod: false,
    })).toBe(true);
  });

  it("adds uncreated placeholders only for people who already have published cards", () => {
    const sarahJune = entry({
      personId: "sarah",
      memberName: "Sarah",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
    });
    const placeholders = uncreatedScorecardPlaceholders({
      duePeriod,
      entries: [sarahJune],
      states: new Map([
        ["sarah", state({ status: "disconnected", everConnected: true })],
        ["jake", EMPTY_GATEWAY_CONNECTION_STATE],
      ]),
    });
    expect(placeholders).toEqual([
      {
        personId: "sarah",
        memberName: "Sarah",
        cardType: "producer",
        periodKind: "monthly",
        periodStart: "2026-08-01",
        periodLabel: "August 2026",
      },
    ]);
  });
});
