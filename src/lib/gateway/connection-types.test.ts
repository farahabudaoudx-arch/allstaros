import { describe, expect, it } from "vitest";
import {
  EMPTY_GATEWAY_CONNECTION_STATE,
  UNAVAILABLE_GATEWAY_CONNECTION_STATE,
  gatewayConnectionNotice,
  gatewayDependentValuesAvailable,
  gatewayStatusLabel,
  shouldPromptGatewayConnection,
  type GatewayConnectionState,
} from "./connection-types";

function state(overrides: Partial<GatewayConnectionState>): GatewayConnectionState {
  return { ...EMPTY_GATEWAY_CONNECTION_STATE, ...overrides };
}

describe("Gateway connection product state", () => {
  it("distinguishes never-connected, connected, disconnected, reconnect, and unavailable", () => {
    expect(gatewayStatusLabel(EMPTY_GATEWAY_CONNECTION_STATE)).toBe("Not connected");
    expect(gatewayStatusLabel(state({ status: "connected", connected: true, everConnected: true }))).toBe("Connected");
    expect(gatewayStatusLabel(state({ status: "disconnected", everConnected: true }))).toBe("Reconnect");
    expect(gatewayStatusLabel(state({ status: "needs_reconnect", everConnected: true, needsReconnect: true }))).toBe("Reconnect");
    expect(gatewayStatusLabel(UNAVAILABLE_GATEWAY_CONNECTION_STATE)).toBe("Unavailable");
  });

  it("prompts only when the member is disconnected and has not dismissed the prompt", () => {
    expect(shouldPromptGatewayConnection(EMPTY_GATEWAY_CONNECTION_STATE)).toBe(true);
    expect(shouldPromptGatewayConnection(state({ connectionInProgress: true }))).toBe(false);
    expect(shouldPromptGatewayConnection(state({ promptDismissedAt: "2026-09-03T12:00:00Z" }))).toBe(false);
    expect(shouldPromptGatewayConnection(state({ status: "connected", connected: true, everConnected: true }))).toBe(false);
    expect(shouldPromptGatewayConnection(UNAVAILABLE_GATEWAY_CONNECTION_STATE)).toBe(false);
  });

  it("treats Gateway-dependent values as current only for a verified connection", () => {
    expect(gatewayDependentValuesAvailable(EMPTY_GATEWAY_CONNECTION_STATE)).toBe(false);
    expect(gatewayDependentValuesAvailable(state({ status: "disconnected", everConnected: true }))).toBe(false);
    expect(gatewayDependentValuesAvailable(UNAVAILABLE_GATEWAY_CONNECTION_STATE)).toBe(false);
    expect(gatewayDependentValuesAvailable(state({ status: "connected", connected: true, everConnected: true }))).toBe(true);
  });

  it("uses distinct never-connected and reconnect notices", () => {
    expect(gatewayConnectionNotice(EMPTY_GATEWAY_CONNECTION_STATE)).toContain("Connect your Gateway");
    expect(gatewayConnectionNotice(state({ status: "disconnected", everConnected: true }))).toContain("disconnected");
    expect(gatewayConnectionNotice(UNAVAILABLE_GATEWAY_CONNECTION_STATE)).toContain("temporarily unavailable");
  });
});