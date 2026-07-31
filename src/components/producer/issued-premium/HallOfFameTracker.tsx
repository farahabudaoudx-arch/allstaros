"use client";

// The Hall of Fame award is an IMO yearly honor: $400,000 personal issued
// premium, year to date, re-earned every calendar year. This band always
// speaks YTD even when the page around it is showing a weekly or monthly view.
// The looping red jacket is the actual prize, so the whole band is a near-black
// cinematic panel and the video's black background melts into it.

const GOAL_CENTS = 400_000 * 100;

function money(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

export function HallOfFameTracker({
  currentCents,
  year,
  goalCents = GOAL_CENTS,
  className = "mt-8",
}: {
  currentCents: number;
  year: number;
  goalCents?: number;
  // Outer spacing is caller-controlled: the Issued Premium page wants a top
  // margin, the Analytics board handles gaps with its own space-y stack.
  className?: string;
}) {
  const pct = goalCents > 0 ? (currentCents / goalCents) * 100 : 0;
  const inducted = currentCents >= goalCents;

  return (
    <div
      className={`${className} overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0d] text-white`}
    >
      <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:gap-7 sm:p-6">
        {/* Spinning jacket — the prize. The video's black background is keyed
            out to true transparency (alpha WebM for Chrome/Firefox/Edge, alpha
            HEVC for Safari), so the jacket floats on the panel with no seam. */}
        <div className="relative mx-auto h-40 w-40 shrink-0 sm:mx-0 sm:h-44 sm:w-44">
          <video
            className="h-full w-full object-cover"
            poster="/hof-jacket-poster.png"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => {
              // Slightly slower than real time for a calmer spin; staying near
              // 1x keeps the 24fps source smooth (0.5x stutters at ~12fps).
              e.currentTarget.playbackRate = 0.8;
            }}
          >
            <source src="/hof-jacket.webm" type="video/webm" />
            <source src="/hof-jacket.mp4" type='video/mp4; codecs="hvc1"' />
          </video>
        </div>

        {/* Progress side */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#e7c66b]">
              Hall of Fame Tracker · {year}
            </p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">
              YTD
            </p>
          </div>

          {/* Same anatomy in both states: one headline, the bar, one detail
              line. Inducted turns green; in progress stays gold. */}
          <div className="mt-3">
            <p
              className={`text-2xl font-semibold tracking-[-0.02em] sm:text-3xl ${
                inducted ? "text-[#34d399]" : "text-[#e7c66b]"
              }`}
            >
              {inducted
                ? `Hall of Fame · ${year}`
                : `${pct.toFixed(pct < 10 ? 1 : 0)}% to Hall of Fame`}
            </p>
          </div>

          {/* Bar */}
          <div className="mt-4">
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{
                  width: `${Math.min(100, Math.max(2, pct))}%`,
                  background: inducted
                    ? "linear-gradient(90deg, #15803d, #34d399)"
                    : "#e7c66b",
                }}
              />
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-white/50">
              <span className="tabular-nums">
                {money(currentCents)}/{money(goalCents)} issued premium
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
