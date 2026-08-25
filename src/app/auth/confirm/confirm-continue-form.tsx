"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { AUTH_DEPLOYMENT_SKEW_COPY } from "@/lib/auth-error-copy";
import { isDeploymentStale } from "@/lib/deployment-skew";
import { confirmOtpAction, type ConfirmOtpState } from "./actions";

const initialState: ConfirmOtpState = { ok: true };

export function ConfirmContinueForm({
  tokenHash,
  type,
  next,
}: {
  tokenHash: string;
  type: string;
  next: string;
}) {
  const [, formAction, pending] = useActionState(confirmOtpAction, initialState);
  const [skewError, setSkewError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (await isDeploymentStale()) {
        window.location.reload();
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (await isDeploymentStale()) {
      e.preventDefault();
      setSkewError(AUTH_DEPLOYMENT_SKEW_COPY);
      return;
    }
    setSkewError(null);
  }

  return (
    <form action={formAction} onSubmit={(e) => void onSubmit(e)} className="space-y-3">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="primary" disabled={pending} className="w-full py-2.5">
        {pending ? "Continuing…" : "Continue"}
      </Button>
      {skewError ? (
        <div className="space-y-2 rounded-xl border border-neg/40 bg-neg/[0.06] px-4 py-3 text-sm text-neg">
          <p>{skewError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-neg/50 px-3 py-1 text-xs font-semibold text-neg transition hover:bg-neg/10"
          >
            Refresh page
          </button>
        </div>
      ) : null}
    </form>
  );
}
