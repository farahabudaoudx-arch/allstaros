"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Wraps a section's page content and plays a brief fade-in entrance on every
 * navigation. Re-keying on the pathname remounts the node, so the CSS
 * `page-enter` animation (defined in globals.css) replays on each route change.
 *
 * The entrance is opacity ONLY, never transform: animating transform promoted
 * this full-page node to a fresh compositing layer each navigation, and its
 * unrasterized tiles flashed as pure-black bars on large displays. Opacity
 * (pre-promoted via `will-change: opacity` in globals.css) composites cheaply,
 * and never turns this node into a containing block, so `position:
 * sticky`/`fixed` descendants behave normally. Honors `prefers-reduced-motion`
 * (the global reset collapses the duration to ~0).
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
