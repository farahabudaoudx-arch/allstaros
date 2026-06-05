"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

// Read the current theme from the `.light` class on <html> (the mechanism
// ThemeToggle uses). Subscribes to class changes so any component that swaps
// the theme re-renders. SSR-safe: defaults to "dark" before mount, then syncs.
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    function read(): Theme {
      return document.documentElement.classList.contains("light") ? "light" : "dark";
    }
    setTheme(read());
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return theme;
}
