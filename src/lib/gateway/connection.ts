import { createHash, randomBytes } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { gatewayConnectSignature } from "./connect-auth";
import {
  EMPTY_GATEWAY_CONNECTION_STATE,
  UNAVAILABLE_GATEWAY_CONNECTION_STATE,
  type GatewayConnectionState,
} from "./connection-types";

type ConnectionRow = {
  status: "disconnected" | "connected" | "needs_reconnect";
  session_generation: number | string;
  first_connected_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  prompt_dismissed_at: string | null;
  initial_backfill_completed_at: string | null;
};

type PendingRequestRow = {
  expires_at: string;
};

const CONNECT_TTL_MINUTES = 10;
const RUNNER_REVOCATION_TIMEOUT_MS = 3_000;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function runnerRevocationConfig() {
  const hosted = process.env.GATEWAY_HOSTED_CONNECT_URL?.trim();
  const token = process.env.GATEWAY_AGENT_CONNECT_TOKEN?.trim();
  if (!hosted || !token) return null;
  try {
    const configured = new URL(hosted);
    if (configured.protocol !== "https:" || configured.username || configured.password) return null;
    return {
      url: new URL("/control/session/revoke", configured.origin).toString(),
      token,
    };
  } catch {
    return null;
  }
}

export async function revokeGatewayRunnerSession(sessionRef: string): Promise<boolean> {
  if (!sessionRef || sessionRef.length > 2048) return false;
  const config = runnerRevocationConfig();
  if (!config) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUNNER_REVOCATION_TIMEOUT_MS);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sessionRef }),
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function loadStoredSessionRef(
  service: ReturnType<typeof createServiceRoleClient>,
  personId: string,
): Promise<string | null> {
  const { data, error } = await service
    .from("gateway_connection")
    .select("session_ref")
    .eq("person_id", personId)
    .maybeSingle();
  if (error) return null;
  return typeof data?.session_ref === "string" && data.session_ref ? data.session_ref : null;
}

function safeGeneration(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function connectionStateFromRow(
  row: ConnectionRow | null,
  connectionInProgress: boolean,
): GatewayConnectionState {
  if (!row) {
    return {
      ...EMPTY_GATEWAY_CONNECTION_STATE,
      connectionInProgress,
    };
  }

  const everConnected = row.first_connected_at != null;
  const connected = row.status === "connected";
  const needsReconnect = row.status === "needs_reconnect";

  return {
    status: connected
      ? "connected"
      : needsReconnect
        ? "needs_reconnect"
        : everConnected
          ? "disconnected"
          : "never_connected",
    connected,
    everConnected,
    connectionInProgress,
    sessionGeneration: safeGeneration(row.session_generation),
    firstConnectedAt: row.first_connected_at,
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    lastVerifiedAt: row.last_verified_at,
    needsReconnect,
    lastError: row.last_error,
    promptDismissedAt: row.prompt_dismissed_at,
    initialBackfillCompletedAt: row.initial_backfill_completed_at,
    unavailableReason: null,
  };
}

export async function loadGatewayConnectionState(
  personId: string,
): Promise<GatewayConnectionState> {
  const service = createServiceRoleClient();
  const [connectionResult, requestResult] = await Promise.all([
    service
      .from("gateway_connection")
      .select(
        "status, session_generation, first_connected_at, connected_at, disconnected_at, last_verified_at, last_error, prompt_dismissed_at, initial_backfill_completed_at",
      )
      .eq("person_id", personId)
      .maybeSingle(),
    service
      .from("gateway_connect_request")
      .select("expires_at")
      .eq("person_id", personId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // A missing migration, transient DB problem, or schema-cache failure should
  // never turn into fake $0/IP or a raw database error on a member screen.
  if (connectionResult.error || requestResult.error) {
    return UNAVAILABLE_GATEWAY_CONNECTION_STATE;
  }

  const pending = requestResult.data as PendingRequestRow | null;
  const connectionInProgress =
    pending != null && Number.isFinite(Date.parse(pending.expires_at)) && Date.parse(pending.expires_at) > Date.now();
  return connectionStateFromRow(connectionResult.data as ConnectionRow | null, connectionInProgress);
}

const CONNECTION_SELECT =
  "person_id, status, session_generation, first_connected_at, connected_at, disconnected_at, last_verified_at, last_error, prompt_dismissed_at, initial_backfill_completed_at";

type ConnectionRowWithPerson = ConnectionRow & { person_id: string };

export async function loadGatewayConnectionStates(
  personIds: string[],
): Promise<Map<string, GatewayConnectionState>> {
  const unique = [...new Set(personIds.filter(Boolean))];
  const states = new Map<string, GatewayConnectionState>();
  for (const id of unique) states.set(id, EMPTY_GATEWAY_CONNECTION_STATE);
  if (unique.length === 0) return states;

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("gateway_connection")
    .select(CONNECTION_SELECT)
    .in("person_id", unique);

  if (error) {
    for (const id of unique) states.set(id, UNAVAILABLE_GATEWAY_CONNECTION_STATE);
    return states;
  }

  for (const row of (data ?? []) as ConnectionRowWithPerson[]) {
    states.set(row.person_id, connectionStateFromRow(row, false));
  }
  return states;
}

export async function createGatewayConnectRequest(personId: string) {
  const state = randomBytes(32).toString("base64url");
  const stateHash = sha256(state);
  const expiresAt = new Date(Date.now() + CONNECT_TTL_MINUTES * 60_000).toISOString();
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("begin_gateway_connection", {
    p_person_id: personId,
    p_state_hash: stateHash,
    p_expires_at: expiresAt,
  });
  if (error || typeof data !== "string") {
    throw new Error("Unable to start Gateway connection right now.");
  }
  return { requestId: data, state, expiresAt };
}

export async function completeGatewayConnectRequest(
  state: string,
  sessionRef: string,
  expectedPersonId?: string,
) {
  if (!state || !sessionRef) throw new Error("Invalid Gateway connection completion.");
  const service = createServiceRoleClient();
  const stateHash = sha256(state);
  let requestPersonId: string | null = null;
  let previousSessionRef: string | null = null;

  const { data: pending, error: pendingError } = await service
    .from("gateway_connect_request")
    .select("person_id, status, expires_at")
    .eq("state_hash", stateHash)
    .maybeSingle();
  if (!pendingError && pending && typeof pending.person_id === "string") {
    requestPersonId = pending.person_id;
    previousSessionRef = await loadStoredSessionRef(service, requestPersonId);
  }

  if (expectedPersonId) {
    if (
      pendingError ||
      !pending ||
      pending.person_id !== expectedPersonId ||
      pending.status !== "pending" ||
      Date.parse(pending.expires_at) <= Date.now()
    ) {
      throw new Error("This Gateway connection attempt is no longer valid.");
    }
  }

  const { data, error } = await service.rpc("complete_gateway_connection", {
    p_state_hash: stateHash,
    p_session_ref: sessionRef,
  });
  if (error || typeof data !== "string") {
    throw new Error("Unable to complete Gateway connection.");
  }
  if (previousSessionRef && previousSessionRef !== sessionRef) {
    await revokeGatewayRunnerSession(previousSessionRef);
  }
  return data;
}

export async function failGatewayConnectRequest(state: string, errorCode: string) {
  if (!state) return;
  const service = createServiceRoleClient();
  await service.rpc("fail_gateway_connection_request", {
    p_state_hash: sha256(state),
    p_error_code: errorCode.slice(0, 120),
  });
}

export async function disconnectGatewayForPerson(personId: string) {
  const service = createServiceRoleClient();
  const previousSessionRef = await loadStoredSessionRef(service, personId);
  const { error } = await service.rpc("disconnect_gateway_connection", {
    p_person_id: personId,
  });
  if (error) throw new Error("Unable to disconnect Gateway right now.");
  if (previousSessionRef) await revokeGatewayRunnerSession(previousSessionRef);
}

export async function dismissGatewayPromptForPerson(personId: string) {
  const service = createServiceRoleClient();
  const { error } = await service.rpc("dismiss_gateway_connection_prompt", {
    p_person_id: personId,
  });
  if (error) throw new Error("Unable to save your Gateway reminder preference.");
}

export function gatewayHostedConnectUrl(args: {
  baseUrl: string;
  state: string;
  callbackUrl: string;
  expiresAt: string;
  connectToken: string;
}) {
  if (!args.connectToken?.trim()) throw new Error("Gateway hosted connector signing is not configured.");
  const callbackUrl = new URL(args.callbackUrl).toString();
  const expiresAt = new Date(args.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) throw new Error("Gateway hosted connector expiry is invalid.");
  const signature = gatewayConnectSignature({
    connectToken: args.connectToken,
    state: args.state,
    callbackUrl,
    expiresAt: expiresAt.toISOString(),
  });
  const url = new URL(args.baseUrl);
  url.searchParams.set("state", args.state);
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("expires_at", expiresAt.toISOString());
  url.searchParams.set("sig", signature);
  return url.toString();
}
