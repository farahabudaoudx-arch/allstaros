"use client";

import { useState, useTransition } from "react";
import { dismissGatewayPrompt } from "@/lib/actions/gateway";

export function GatewayConnectPrompt({
  reminderId,
  initialOpen,
  reconnect = false,
}: {
  reminderId: string | null;
  initialOpen: boolean;
  reconnect?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  function later() {
    if (!reminderId) return;
    setError(null);
    startTransition(async () => {
      const result = await dismissGatewayPrompt(reminderId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-black/65 px-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gateway-connect-prompt-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-hairline bg-card p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
          Gateway connection
        </p>
        <h2
          id="gateway-connect-prompt-title"
          className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-ink"
        >
          {reconnect ? "Reconnect your personal Gateway" : "Connect your personal Gateway"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-subtle">
          {reconnect
            ? "Your Gateway has disconnected. Please reconnect so we can run your scorecard. You can keep using the rest of All Star OS in the meantime."
            : "Issued Premium and other Gateway report-driven numbers stay unknown until your Gateway is connected. You can keep using the rest of All Star OS and connect later from Settings."}
        </p>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-neg">
            {error}
          </p>
        ) : null}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <form action="/api/gateway/connect/start" method="post" className="sm:flex-1">
            <input type="hidden" name="returnTo" value="/producer" />
            <button
              type="submit"
              className="w-full rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              {reconnect ? "Reconnect Gateway" : "Connect Gateway"}
            </button>
          </form>
          <button
            type="button"
            disabled={pending}
            onClick={later}
            className="rounded-full border border-hairline px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-mute disabled:opacity-60 sm:flex-1"
          >
            {pending ? "Saving…" : "I’ll do it later"}
          </button>
        </div>
      </div>
    </div>
  );
}
