"use client";

import Image from "next/image";
import { useState } from "react";
import { ScorecardStars } from "./ScorecardStars";
import { initialsFor } from "@/lib/headshots/initials";

export type ScorecardCardRating = {
  label: string;
  value: number | null;
  metricValue?: string;
};

export function ScorecardBaseballCard({
  memberName,
  photoUrl,
  periodLabel,
  scorecardType,
  averageRating,
  totalRating,
  maximumRatingTotal,
  ratings,
  ratingLabel = "average",
}: {
  memberName: string;
  photoUrl: string | null;
  periodLabel: string;
  scorecardType: "Producer" | "Builder";
  averageRating: number | null;
  totalRating: number | null;
  maximumRatingTotal: number;
  ratings: ScorecardCardRating[];
  ratingLabel?: string;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="producer-baseball-card scorecard-collectible mx-auto w-full max-w-[28rem]">
      <button
        type="button"
        aria-label={`Flip ${memberName} scorecard to the ${flipped ? "front" : "back"}`}
        aria-pressed={flipped}
        onClick={() => setFlipped((current) => !current)}
        className="producer-baseball-card__flip scorecard-collectible__button group block w-full text-left"
      >
        <span className={`producer-baseball-card__inner scorecard-collectible__inner${flipped ? " scorecard-collectible__inner--flipped" : ""}`}>
          <span aria-hidden={flipped} className="producer-baseball-card__front scorecard-collectible__face scorecard-collectible__front">
            <span className="scorecard-collectible__portrait">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" loading="lazy" referrerPolicy="origin" className="h-full w-full object-cover object-top" />
              ) : (
                <span className="scorecard-collectible__initials">{initialsFor(memberName)}</span>
              )}
            </span>
            <span className="scorecard-collectible__front-shade" />
            <span className="scorecard-collectible__front-top">
              <Image src="/logo.png" alt="All Star" width={160} height={90} className="scorecard-collectible__logo" />
              <span className="scorecard-collectible__edition">{scorecardType}<br />Scorecard</span>
            </span>
            <span className="scorecard-collectible__identity">
              <span className="scorecard-collectible__eyebrow">{periodLabel}</span>
              <span className="scorecard-collectible__name break-words">{memberName}</span>
              <span className="scorecard-collectible__front-rating">
                <span className="scorecard-collectible__front-score">{averageRating == null ? "—" : averageRating.toFixed(2)}<span> / 5</span></span>
                {averageRating != null ? <ScorecardStars value={averageRating} decorative /> : null}
              </span>
              <span className="sr-only">{periodLabel} {scorecardType} Scorecard</span>
            </span>
          </span>
          <span aria-hidden={!flipped} className="producer-baseball-card__back scorecard-collectible__face scorecard-collectible__back">
            <span className="scorecard-collectible__back-content">
              <span className="scorecard-collectible__back-top">
                <Image src="/logo.png" alt="All Star" width={130} height={74} className="scorecard-collectible__logo" />
                <span className="scorecard-collectible__edition">{periodLabel}<br />{scorecardType} Scorecard</span>
              </span>
              <span className="scorecard-collectible__score-block">
                {averageRating != null ? <span className="scorecard-collectible__rating-fraction">{Number(averageRating.toFixed(2))}/5</span> : null}
                <span className="scorecard-collectible__eyebrow">{ratingLabel} rating</span>
                {averageRating != null ? <ScorecardStars value={averageRating} decorative /> : null}
                <span className="sr-only">{averageRating == null ? "Rating unavailable" : `${averageRating.toFixed(ratingLabel === "overall" ? 2 : 1)} ${ratingLabel}`}</span>
                {totalRating != null ? <span className="scorecard-collectible__points">{totalRating} of {maximumRatingTotal} points</span> : null}
              </span>
              <span className="scorecard-collectible__ratings" data-density={ratings.length > 3 ? "compact" : "normal"}>
                {ratings.map((rating) => (
                  <span key={rating.label} className="scorecard-collectible__rating-row">
                    <span className="scorecard-collectible__rating-detail"><span className="scorecard-collectible__rating-label">{rating.label}</span>{rating.metricValue != null ? <span className="scorecard-collectible__metric-value">{rating.metricValue}</span> : null}</span>
                    <CardStarScale label={rating.label} value={rating.value} />
                  </span>
                ))}
              </span>
              <span className="scorecard-collectible__signature">
                <span className="break-words">{memberName}</span>
                <span className="scorecard-collectible__signature-rule" />
              </span>
            </span>
          </span>
        </span>
      </button>
      <p className="producer-baseball-card__hint mt-5 text-center text-sm font-medium leading-5 text-subtle">Click To Flip</p>
    </div>
  );
}

export type ProducerCardRating = ScorecardCardRating;

export function ProducerBaseballCard(props: Omit<
  Parameters<typeof ScorecardBaseballCard>[0],
  "scorecardType" | "maximumRatingTotal" | "ratingLabel"
>) {
  return (
    <ScorecardBaseballCard
      {...props}
      scorecardType="Producer"
      maximumRatingTotal={5}
      ratingLabel="overall"
    />
  );
}

function CardStarScale({ label, value }: { label: string; value: number | null }) {
  if (value == null) {
    return <span className="mt-2 block text-xs text-white/55">Unavailable</span>;
  }

  return <ScorecardStars value={value} label={label} />;
}
