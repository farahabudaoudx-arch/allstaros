export type GatewayConnectionProductStatus =
  | "never_connected"
  | "connected"
  | "disconnected"
  | "needs_reconnect"
  | "unavailable";

export type GatewayConnectionState = {
  status: GatewayConnectionProductStatus;
  connected: boolean;
  everConnected: boolean;
  connectionInProgress: boolean;
  sessionGeneration: number | null;
  firstConnectedAt: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastVerifiedAt: string | null;
  needsReconnect: boolean;
  lastError: string | null;
  promptDismissedAt: string | null;
  initialBackfillCompletedAt: string | null;
  unavailableReason: "state_store_unavailable" | null;
};

export const EMPTY_GATEWAY_CONNECTION_STATE: GatewayConnectionState = {
  status: "never_connected",
  connected: false,
  everConnected: false,
  connectionInProgress: false,
  sessionGeneration: null,
  firstConnectedAt: null,
  connectedAt: null,
  disconnectedAt: null,
  lastVerifiedAt: null,
  needsReconnect: false,
  lastError: null,
  promptDismissedAt: null,
  initialBackfillCompletedAt: null,
  unavailableReason: null,
};

export const UNAVAILABLE_GATEWAY_CONNECTION_STATE: GatewayConnectionState = {
  ...EMPTY_GATEWAY_CONNECTION_STATE,
  status: "unavailable",
  unavailableReason: "state_store_unavailable",
};

export function gatewayStatusLabel(state: GatewayConnectionState) {
  if (state.status === "unavailable") return "Unavailable";
  if (state.connectionInProgress) return "Connecting…";
  if (state.connected) return "Connected";
  if (state.needsReconnect || state.everConnected) return "Reconnect";
  return "Not connected";
}

export function shouldPromptGatewayConnection(state: GatewayConnectionState) {
  return (
    state.status !== "unavailable" &&
    !state.connected &&
    !state.connectionInProgress &&
    state.promptDismissedAt == null
  );
}

export function gatewayDependentValuesAvailable(state: GatewayConnectionState) {
  return state.connected;
}

export function gatewayConnectionNotice(state: GatewayConnectionState): string | null {
  if (state.status === "unavailable") {
    return "Gateway connection status is temporarily unavailable. Issued Premium numbers are hidden until the connection can be verified.";
  }
  if (state.connected) return null;
  if (state.needsReconnect || state.everConnected) {
    return "Your Gateway is disconnected. Reconnect in Settings so current Issued Premium numbers can be reported again.";
  }
  return "Connect your Gateway in Settings before Issued Premium numbers can be reported.";
}
