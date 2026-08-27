export default function ScorecardsLoading() {
  return (
    <main aria-label="Loading Scorecards" aria-busy="true" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <div className="h-10 w-48 animate-pulse rounded-lg bg-card-hi" />
      <div className="mt-4 h-5 w-full max-w-xl animate-pulse rounded bg-card-hi" />
      <div className="mt-9 h-px bg-hairline" />
      <div className="mt-6 overflow-hidden rounded-[1.4rem] border border-hairline bg-card">
        <div className="space-y-3 border-b border-hairline px-6 py-7">
          <div className="h-7 w-40 animate-pulse rounded bg-card-hi" />
          <div className="h-4 w-56 animate-pulse rounded bg-card-hi" />
        </div>
        <div className="grid gap-px bg-hairline sm:grid-cols-2">
          <div className="h-44 animate-pulse bg-card-hi/40" />
          <div className="h-44 animate-pulse bg-card-hi/40" />
        </div>
        <div className="h-64 animate-pulse bg-card" />
      </div>
      <span className="sr-only">Loading your monthly Producer Scorecard</span>
    </main>
  );
}
