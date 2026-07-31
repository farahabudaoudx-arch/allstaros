"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

/** Inline script run before paint to apply the saved theme and avoid a flash
 *  of the wrong palette. Injected once from the root layout. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");var p=location.pathname;var landing=p==="/"||p.indexOf("/join")===0||p.indexOf("/auth")===0;if(t==="light"&&!landing){document.documentElement.classList.add("light");}}catch(e){}})();`;

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

export function ThemeToggle({
  variant = "pill",
  collapsed = false,
}: {
  variant?: "pill" | "icon";
  collapsed?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>("dark");

  // Sync from the class the init script already applied.
  useEffect(() => setTheme(currentTheme()), []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("light", next === "light");
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  const isDark = theme === "dark";
  const label = isDark ? "Light mode" : "Dark mode";
  // Icon reflects the current theme: a crescent moon in dark mode, a sun in light.
  const Icon = isDark ? MoonIcon : SunIcon;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={`Switch to ${label.toLowerCase()}`}
        title={`Switch to ${label.toLowerCase()}`}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-subtle transition hover:border-mute hover:text-ink"
      >
        <Icon />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${label.toLowerCase()}`}
      title={collapsed ? `Switch to ${label.toLowerCase()}` : undefined}
      className={`flex items-center gap-2 rounded-full border border-hairline px-3 py-2 text-xs font-medium text-subtle transition hover:border-mute hover:text-ink ${
        collapsed ? "justify-center" : ""
      }`}
    >
      <Icon />
      {!collapsed ? <span>{label}</span> : null}
    </button>
  );
}

/** Two-way segmented Dark/Light switch — same underlying mechanics as
 *  ThemeToggle, for chrome that wants an explicit pill pair instead of a
 *  single cycling button (e.g. the menu settings drawer). */
export function ThemePills() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => setTheme(currentTheme()), []);

  function choose(next: Theme) {
    setTheme(next);
    document.documentElement.classList.toggle("light", next === "light");
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-hairline p-0.5">
      {(["dark", "light"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => choose(value)}
          aria-pressed={theme === value}
          className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
            theme === value ? "bg-accent text-black" : "text-subtle hover:text-ink"
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
