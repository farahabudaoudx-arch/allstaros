"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectGateway } from "@/lib/actions/gateway";
import {
  GATEWAY_NEVER_CONNECTED_COPY,
  GATEWAY_RECONNECT_COPY,
  gatewayStatusLabel,
  type GatewayConnectionState,
} from "@/lib/gateway/connection-types";

export function GatewayConnectionSettings({ state }: { state: GatewayConnectionState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = gatewayStatusLabel(state);
  const unavailable = state.status === "unavailable";

  function onDisconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectGateway();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div data-testid="gateway-connection-settings" className="space-y-5">
      <div className="rounded-xl border border-hairline bg-background/40 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">Gateway</p>
            <p className="mt-1 text-sm text-subtle">
              {state.connected
                ? "Your personal Gateway is connected."
                : state.needsReconnect || state.everConnected
                  ? GATEWAY_RECONNECT_COPY
                  : GATEWAY_NEVER_CONNECTED_COPY}
            </p>
          </div>
          <span className={state.connected ? "text-sm font-medium text-pos" : "text-sm font-medium text-mute"}>
            {label}
          </span>
        </div>

        {state.connectionInProgress ? (
          <p className="mt-4 border-l-2 border-accent pl-3 text-sm text-subtle">
            A Gateway sign-in is already in progress. Starting again replaces only the pending attempt; a valid existing session is kept until a new sign-in succeeds.
          </p>
        ) : null}
        {unavailable ? (
          <p role="alert" className="mt-4 border-l-2 border-neg pl-3 text-sm text-neg">
            Gateway connection status is temporarily unavailable. No Gateway-dependent number will be treated as current until it can be verified.
          </p>
        ) : null}
        {error ? <p role="alert" className="mt-4 text-sm text-neg">{error}</p> : null}
      </div>

      {state.connected ? (
        <button
          type="button"
          onClick={onDisconnect}
          disabled={pending}
          className="rounded-full border border-hairline px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-neg hover:text-neg disabled:opacity-60"
        >
          {pending ? "Disconnecting…" : "Disconnect Gateway"}
        </button>
      ) : (
        <form action="/api/gateway/connect/start" method="post">
          <input type="hidden" name="returnTo" value="/producer?settings=gateway" />
          <button
            type="submit"
            disabled={unavailable}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.everConnected ? "Reconnect Gateway" : "Connect Gateway"}
          </button>
        </form>
      )}

      <p className="text-xs leading-5 text-mute">
        Once connected, All Star OS can run scheduled Gateway reports automatically. We do not store your Gateway password or verification codes. If Gateway requests verification during sign-in, complete that challenge to finish connecting.
      </p>
    </div>
  );
}
