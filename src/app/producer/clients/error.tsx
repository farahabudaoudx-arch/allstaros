"use client";

import { useEffect } from "react";

export default function ClientsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Clients page error:", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-14 md:px-10">
      <div className="rounded-2xl border border-neg/40 bg-card p-6">
        <h2 className="mb-2 text-lg font-semibold text-ink">
          Something went wrong in the Clients section.
        </h2>
        <pre className="overflow-auto rounded-lg bg-background p-3 text-xs text-neg whitespace-pre-wrap">
          {error.message}
        </pre>
        <button
          onClick={reset}
          className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-medium text-black transition hover:bg-accent-soft"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
