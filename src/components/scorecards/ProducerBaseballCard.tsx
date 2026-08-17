"use client";

import Image from "next/image";
import { useState } from "react";
import { initialsFor } from "@/lib/headshots/initials";

export type ProducerCardRanking = {
  label: string;
  rank: number;
  population: number;
};

export function ProducerBaseballCard({
  memberName,
  photoUrl,
  periodLabel,
  averageRating,
  totalRating,
  rankings,
}: {
  memberName: string;
  photoUrl: string | null;
  periodLabel: string;
  averageRating: number | null;
  totalRating: number | null;
  rankings: ProducerCardRanking[];
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[25rem]">
      <button
        type="button"
        aria-label={`Flip ${memberName} scorecard to the ${flipped ? "front" : "back"}`}
        aria-pressed={flipped}
        onClick={() => setFlipped((current) => !current)}
        className="group block aspect-[5/7] w-full rounded-[1.35rem] text-left [perspective:1400px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <span
          className={`relative block h-full w-full transition-transform duration-300 [transform-style:preserve-3d] [transition-timing-function:cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none ${flipped ? "[transform:rotateY(180deg)]" : ""}`}
        >
          <span
            aria-hidden={flipped}
            className="absolute inset-0 flex overflow-hidden rounded-[1.35rem] border border-accent/60 bg-[#090909] [backface-visibility:hidden]"
          >
            <span className="m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[0.95rem] border border-white/15">
              <span className="flex h-20 shrink-0 items-center justify-center border-b border-white/15 bg-black px-8">
                <Image src="/logo.png" alt="All Star" width={180} height={102} className="h-10 w-auto" />
              </span>
              <span className="relative min-h-0 flex-1 overflow-hidden bg-card-hi">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="origin"
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-7xl font-semibold tracking-[-0.06em] text-ink">
                    {initialsFor(memberName)}
                  </span>
                )}
              </span>
              <span className="shrink-0 border-t border-white/15 bg-black px-6 py-5 text-center">
                <span className="block text-2xl font-semibold tracking-[-0.035em] text-white">{memberName}</span>
                <span className="mt-1 block text-sm text-white/65">{periodLabel} Producer</span>
              </span>
            </span>
          </span>

          <span
            aria-hidden={!flipped}
            className="absolute inset-0 flex overflow-hidden rounded-[1.35rem] border border-accent/60 bg-[#090909] [backface-visibility:hidden] [transform:rotateY(180deg)]"
          >
            <span className="m-2 flex min-w-0 flex-1 flex-col rounded-[0.95rem] border border-white/15 px-5 py-5 sm:px-6">
              <span className="flex items-center justify-between border-b border-white/15 pb-4">
                <Image src="/logo.png" alt="All Star" width={130} height={74} className="h-7 w-auto" />
                <span className="text-xs tabular-nums text-white/55">{periodLabel}</span>
              </span>

              <span className="border-b border-white/15 py-5 text-center">
                <span className="block text-[3.75rem] font-semibold leading-none tabular-nums tracking-[-0.055em] text-accent">
                  {averageRating == null ? "—" : averageRating.toFixed(1)}
                </span>
                <span className="mt-2 block text-sm font-medium text-white">
                  {averageRating == null ? "Average unavailable" : `${averageRating.toFixed(1)} average`}
                </span>
                {totalRating != null ? (
                  <span className="mt-1 block text-xs tabular-nums text-white/55">{totalRating} of 40 points</span>
                ) : null}
              </span>

              <span className="grid min-h-0 flex-1 grid-cols-2 content-center gap-x-5">
                {rankings.map((ranking) => (
                  <span key={ranking.label} className="border-b border-white/10 py-3 last:border-b-0">
                    <span className="block text-[0.68rem] leading-tight text-white/55 sm:text-xs">{ranking.label}</span>
                    <span className="mt-1 block text-base font-semibold tabular-nums text-white sm:text-lg">
                      #{ranking.rank} of {ranking.population}
                    </span>
                  </span>
                ))}
              </span>
            </span>
          </span>
        </span>
      </button>
      <p className="mt-4 text-center text-sm text-subtle">Click the card to see the {flipped ? "front" : "rankings"}.</p>
    </div>
  );
}
