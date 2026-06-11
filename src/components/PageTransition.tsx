"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Wraps a section's page content and plays a brief fade-up entrance on every
 * navigation. Re-keying on the pathname remounts the node, so the CSS
 * `page-enter` animation (defined in globals.css) replays on each route change.
 *
 * The animation uses `backwards` fill — it never leaves a lingering transform
 * on the element, so `position: sticky`/`fixed` descendants behave normally
 * once the entrance settles. Honors `prefers-reduced-motion` (the global reset
 * collapses the duration to ~0).
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <div key={pathname} className={`page-enter ${className ?? ""}`.trim()}>
      {children}
    </div>
  );
}
