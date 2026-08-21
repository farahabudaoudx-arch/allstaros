"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { PRODUCER_PAGE_ERROR_COPY } from "@/lib/producer/error-copy";

/**
 * Producer-segment error boundary. Catches unexpected failures in pages and
 * nested layouts under /producer (not this segment's own layout.tsx). Users get
 * a stable retry UI; the real error goes to Sentry / server logs.
 */
export default function ProducerError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        route: "/producer",
        boundary: "producer-error",
        ...(error.digest ? { digest: error.digest } : {}),
      },
    });
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-16 md:px-10">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-subtle">
        {PRODUCER_PAGE_ERROR_COPY}
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-mute">Ref: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-6 w-fit rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background transition hover:bg-accent-soft active:scale-[0.97]"
      >
        Try again
      </button>
    </main>
  );
}
