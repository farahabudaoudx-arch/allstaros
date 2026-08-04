import type { ReactNode } from "react";

/**
 * Centered page title, with an optional row of controls beneath it.
 *
 * There is deliberately no eyebrow/kicker slot. Pages used to carry a small
 * all-caps label above the title ("Builder", "My Team", "Tracking"); it said
 * nothing the title and the menu you came from didn't already say, so it's
 * gone. Don't add it back.
 *
 * There is also no Back/Home pair any more. It existed because the app was a
 * drill-down of tile menus and leaving a page meant retracing your steps. The
 * sidebar is always on screen now, so every destination is one click away and
 * two buttons under every title were just noise. `backHref` is still accepted
 * so callers don't all have to change at once, but nothing renders from it.
 *
 * `children` is anything that used to sit next to or below the title
 * (description text, filter pills, action buttons), rendered centered beneath.
 */
export function PageHeader({
  title,
  compact = false,
  children,
}: {
  title: string;
  /** Retained for call-site compatibility; no longer rendered. */
  backHref?: string;
  /** Tighter type and spacing, for pages that have to fit a screen without
   *  scrolling (the Daily Tracker). Same parts, less air. */
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-center text-center ${compact ? "mb-4" : "mb-8"}`}
    >
      <h1
        className={`font-semibold leading-[1.1] tracking-[-0.03em] ${
          compact
            ? "text-[clamp(1.5rem,3vw,2rem)]"
            : "text-[clamp(2rem,5vw,3rem)]"
        }`}
      >
        {title}
      </h1>
      {children ? (
        <div
          className={`flex w-full flex-col items-center gap-4 ${compact ? "mt-3" : "mt-5"}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
