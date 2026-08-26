"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type OdometerProps = {
  value: string;
  className?: string;
};

type ReelStyle = CSSProperties & {
  "--odometer-step": number;
  "--odometer-duration": string;
  "--odometer-delay": string;
};

export function Odometer({ value, className }: OdometerProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);
  const digits = [...value].filter((character) => /\d/.test(character)).length;
  let digitIndex = 0;

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() => setActive(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setActive(true);
        observer.disconnect();
      },
      { threshold: 0.35 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={rootRef}
      className={["odometer", className].filter(Boolean).join(" ")}
      data-active={active}
      aria-label={value}
    >
      {[...value].map((character, index) => {
        if (!/\d/.test(character)) {
          return (
            <span className="odometer-separator" aria-hidden="true" key={`${character}-${index}`}>
              {character}
            </span>
          );
        }

        const currentDigit = digitIndex;
        digitIndex += 1;
        const steps = 20 + Number(character);
        const reverseIndex = digits - currentDigit - 1;
        const style: ReelStyle = {
          "--odometer-step": steps,
          "--odometer-duration": `${1450 + currentDigit * 65}ms`,
          "--odometer-delay": `${reverseIndex * 32}ms`,
        };

        return (
          <span className="odometer-digit" aria-hidden="true" key={`${character}-${index}`}>
            <span className="odometer-reel" style={style}>
              {Array.from({ length: steps + 1 }, (_, reelIndex) => (
                <span key={reelIndex}>{reelIndex % 10}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
