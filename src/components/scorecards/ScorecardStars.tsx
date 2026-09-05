import { useId } from "react";
import "./scorecard-visuals.css";

const outline = "32,3 40,22 61,24 46,38 50,59 32,49 14,59 18,38 3,24 24,22";

/** Faceted gold artwork shared by the report, rating guide and collectible card. */
export function ScorecardStars({ value, label, prominent = false, decorative = false }: {
  value: number;
  label?: string;
  prominent?: boolean;
  decorative?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0;
  const display = Number.isInteger(safeValue) ? String(safeValue) : safeValue.toFixed(1);
  return (
    <span data-scorecard-stars="" className={`scorecard-stars${prominent ? " scorecard-stars--hero" : ""}`}
      aria-label={decorative ? undefined : `${label}: ${display} out of 5 stars`} aria-hidden={decorative || undefined}>
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(1, safeValue - index));
        return (
          <span key={index} className="scorecard-star" data-star={fill === 1 ? "filled" : fill === 0 ? "hollow" : "partial"} aria-hidden="true">
            <svg viewBox="0 0 64 66" className="scorecard-star__empty" fill="none"><polygon points={outline} fill="#25282b" stroke="#67645b" strokeWidth="1.2" /></svg>
            <span className="scorecard-star__fill" style={{ clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }}>
              <svg viewBox="0 0 64 66" fill="none">
                <defs><linearGradient id={`${id}-${index}`} x1="10" y1="4" x2="48" y2="62" gradientUnits="userSpaceOnUse"><stop stopColor="#fff5c9" /><stop offset=".35" stopColor="#fbe094" /><stop offset=".58" stopColor="#d6a33c" /><stop offset="1" stopColor="#83521b" /></linearGradient></defs>
                <polygon points={outline} transform="translate(0 3)" fill="#704415" />
                <polygon points={outline} fill={`url(#${id}-${index})`} stroke="#f6d785" strokeWidth=".8" />
                <path d="M32 3 32 33 24 22Z" fill="#fff5ce" /><path d="M32 3 40 22 32 33Z" fill="#d7a039" />
                <path d="m40 22 21 2-29 9Z" fill="#fff1af" /><path d="m61 24-15 14-14-5Z" fill="#b87b25" />
                <path d="m46 38 4 21-18-26Z" fill="#e6bb58" /><path d="m50 59-18-10V33Z" fill="#9f6820" />
                <path d="m32 49-18 10 18-26Z" fill="#f7ce72" /><path d="m14 59 4-21 14-5Z" fill="#b77c2c" />
                <path d="M18 38 3 24 32 33Z" fill="#e9bc59" /><path d="m3 24 21-2 8 11Z" fill="#fff3be" />
                <path d="m24 22 8-19 8 19 21 2" stroke="#fff8df" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
        );
      })}
    </span>
  );
}
