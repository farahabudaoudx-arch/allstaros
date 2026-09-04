import { describe, expect, it } from "vitest";
import { EMPTY_GATEWAY_CONNECTION_STATE } from "./connection-types";
import {
  gatewayReminderBusinessDate,
  isGatewayReminderMonday,
  suppressGatewayLaunchAfterExplicitDisconnect,
} from "./reminders";

describe("Gateway reminder calendar semantics", () => {
  it("uses America/Chicago across the UTC date boundary", () => {
    const instant = new Date("2026-09-08T00:30:00.000Z");
    expect(gatewayReminderBusinessDate(instant)).toBe("2026-09-07");
    expect(isGatewayReminderMonday(instant)).toBe(true);
  });

  it("suppresses only an explicit-disconnect relaunch on the same Chicago day", () => {
    const state = {
      ...EMPTY_GATEWAY_CONNECTION_STATE,
      status: "disconnected" as const,
      everConnected: true,
      firstConnectedAt: "2026-09-01T15:00:00.000Z",
      promptDismissedAt: "2026-09-04T14:00:00.000Z",
    };
    expect(suppressGatewayLaunchAfterExplicitDisconnect(state, "2026-09-04")).toBe(true);
    expect(suppressGatewayLaunchAfterExplicitDisconnect(state, "2026-09-05")).toBe(false);
  });

  it("does not reuse the old connection prompt dismissal for never-connected members", () => {
    const state = {
      ...EMPTY_GATEWAY_CONNECTION_STATE,
      promptDismissedAt: "2026-09-04T14:00:00.000Z",
    };
    expect(suppressGatewayLaunchAfterExplicitDisconnect(state, "2026-09-04")).toBe(false);
  });

  it("does not suppress a dead-session reconnect reminder with an older disconnect stamp", () => {
    const state = {
      ...EMPTY_GATEWAY_CONNECTION_STATE,
      status: "needs_reconnect" as const,
      everConnected: true,
      needsReconnect: true,
      firstConnectedAt: "2026-09-01T15:00:00.000Z",
      promptDismissedAt: "2026-09-04T14:00:00.000Z",
    };
    expect(suppressGatewayLaunchAfterExplicitDisconnect(state, "2026-09-04")).toBe(false);
  });
});
