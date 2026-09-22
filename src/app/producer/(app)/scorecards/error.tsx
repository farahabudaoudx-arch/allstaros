"use client";

import { useEffect } from "react";

export default function ScorecardsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-5 py-12 md:px-10">
      <div className="w-full rounded-[1.4rem] border border-hairline bg-card px-6 py-10 sm:px-10">
        <p className="text-sm font-medium text-neg">Scorecards could not load</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-ink">Your data is still safe.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-subtle">
          We couldn’t retrieve the latest Gateway reports. Try again; if the problem continues, report it from the app footer.
        </p>
        <button type="button" onClick={() => reset()} className="mt-6 rounded-xl border border-hairline bg-card-hi px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent">
          Try again
        </button>
      </div>
    </main>
  );
}
