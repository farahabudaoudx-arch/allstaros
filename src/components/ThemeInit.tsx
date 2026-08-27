"use client";

import { useServerInsertedHTML } from "next/navigation";
import { themeInitScript } from "@/components/ThemeToggle";

/**
 * Injects the theme boot script into the SSR HTML stream outside the
 * client React tree. A plain <script> in layout.tsx triggers React 19's
 * "Encountered a script tag while rendering React component" warning
 * because client reconciliation never executes those tags.
 */
export function ThemeInit() {
  useServerInsertedHTML(() => (
    <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
  ));
  return null;
}
