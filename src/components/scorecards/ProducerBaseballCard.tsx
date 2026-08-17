"use client";

import Image from "next/image";
import { useState } from "react";
import { initialsFor } from "@/lib/headshots/initials";

export type ProducerCardRating = {
  label: string;
  value: number | null;
};

export function ProducerBaseballCard({
  memberName,
  photoUrl,
  periodLabel,
  averageRating,
  totalRating,
  ratings,
}: {
  memberName: string;
  photoUrl: string | null;
  periodLabel: string;
  averageRating: number | null;
  totalRating: number | null;
  ratings: ProducerCardRating[];
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="producer-baseball-card mx-auto w-full max-w-[25rem]">
      <button
        type="button"
        aria-label={`Flip ${memberName} scorecard to the ${flipped ? "front" : "back"}`}
        aria-pressed={flipped}
        onClick={() => setFlipped((current) => !current)}
        className="producer-baseball-card__flip group block aspect-[5/7] w-full rounded-[1.35rem] text-left transition-transform duration-150 [perspective:1400px] active:scale-[0.99] motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <span
          className={`producer-baseball-card__inner relative block h-full w-full transition-transform [transform-style:preserve-3d] [transition-duration:250ms] [transition-timing-function:cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none ${flipped ? "[transform:rotateY(180deg)]" : ""}`}
        >
          <span
            aria-hidden={flipped}
            className="producer-baseball-card__front absolute inset-0 flex overflow-hidden rounded-[1.35rem] border border-accent/60 bg-[#090909] [backface-visibility:hidden]"
          >
            <span className="relative m-2 min-w-0 flex-1 overflow-hidden rounded-[0.95rem] border border-white/15 bg-card-hi">
              <span className="absolute inset-0">
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
              <span className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-b from-transparent via-black/80 to-black px-6 pb-7 pt-28 text-center">
                <Image src="/logo.png" alt="All Star" width={160} height={90} className="h-9 w-auto" />
                <span className="mt-3 block text-2xl font-semibold tracking-[-0.035em] text-white">{memberName}</span>
                <span className="mt-1 block text-sm text-white/65">{periodLabel} Producer Scorecard</span>
              </span>
            </span>
          </span>

          <span
            aria-hidden={!flipped}
            className="producer-baseball-card__back absolute inset-0 flex overflow-hidden rounded-[1.35rem] border border-accent/60 bg-[#090909] [backface-visibility:hidden] [transform:rotateY(180deg)]"
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
                {ratings.map((rating) => (
                  <span key={rating.label} className="border-b border-white/10 py-3">
                    <span className="block text-[0.68rem] leading-tight text-white/55 sm:text-xs">{rating.label}</span>
                    <CardStarScale label={rating.label} value={rating.value} />
                  </span>
                ))}
              </span>
            </span>
          </span>
        </span>
      </button>
      <p className="producer-baseball-card__hint mt-4 text-center text-sm text-subtle">Click the card to see the {flipped ? "front" : "star ratings"}.</p>
    </div>
  );
}

function CardStarScale({ label, value }: { label: string; value: number | null }) {
  if (value == null) {
    return <span className="mt-2 block text-xs text-white/55">Unavailable</span>;
  }

  return (
    <span className="mt-2 inline-flex gap-0.5 text-[1.05rem] leading-none" aria-label={`${label}: ${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={index < value ? "text-accent" : "text-white/15"} aria-hidden="true">★</span>
      ))}
    </span>
  );
}
