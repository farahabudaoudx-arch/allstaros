"use client";

import { useEffect } from "react";
import { AUTH_DEPLOYMENT_SKEW_COPY } from "@/lib/auth-error-copy";
import { isDeploymentStale } from "@/lib/deployment-skew";
import { InstallationLogo } from "@/components/InstallationLogo";

/** Recovery UI when confirm Server Actions fail (often post-deploy skew). */
export default function ConfirmError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void (async () => {
      if (await isDeploymentStale()) {
        window.location.reload();
      }
    })();
  }, []);

  const skewish =
    /server action|action.*not found|deployment|dpl/i.test(error.message) ||
    /server action|action.*not found|deployment|dpl/i.test(error.digest ?? "");

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-card p-10 text-center">
        <InstallationLogo className="app-logo mx-auto h-10 w-auto" />
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">Please refresh and try again</h1>
        <p className="mt-3 text-sm text-mute">
          {skewish ? AUTH_DEPLOYMENT_SKEW_COPY : "Something went wrong on this page. Please try again."}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-background transition hover:bg-accent-soft"
          >
            Refresh page
          </button>
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-full border border-hairline py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
