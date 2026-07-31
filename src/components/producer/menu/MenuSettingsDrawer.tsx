"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/Avatar";
import { ThemePills } from "@/components/ThemeToggle";

/** Slide duration, kept in sync with the `duration-300` classes below. */
const DRAWER_MS = 300;

export type MenuPerson = {
  fullName: string;
  npn: string | null;
  isBuilder: boolean;
  photoUrl: string | null;
  discordConnected: boolean;
};

/**
 * Right-side settings drawer opened from the avatar button on every menu
 * screen. Every row deep-links into the real /producer/settings page (which
 * already has these sections) — this drawer is just a fast way in, not a
 * second copy of the forms.
 */
export function MenuSettingsDrawer({
  person,
  open,
  onClose,
}: {
  person: MenuPerson;
  open: boolean;
  onClose: () => void;
}) {
  // The portal target (document.body) doesn't exist during SSR, so we defer
  // rendering it until after mount — matching BugReportModal's pattern —
  // rather than branching on `typeof document`, which causes a hydration
  // mismatch (server renders null, client would render the portal on the
  // very first pass).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // `present` = is the drawer in the DOM at all; `shown` = is it in its
  // open position. They are separate so the drawer can animate out before it
  // unmounts. Critically, when closed NOTHING is rendered: an opacity-0
  // full-viewport scrim is still a painted compositing layer, and leaving one
  // on every menu screen made stray black rectangles flash on large displays.
  const [present, setPresent] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      // Paint one frame in the closed position first, so the slide-in
      // actually transitions instead of snapping straight to open.
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const timer = setTimeout(() => setPresent(false), DRAWER_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!mounted || !present) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex justify-end ${shown ? "" : "pointer-events-none"}`}
      inert={!shown}
    >
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
          shown ? "opacity-100 backdrop-blur-[2px]" : "opacity-0"
        }`}
      />
      <aside
        className={`relative flex h-full w-full max-w-sm flex-col border-l border-hairline bg-card transition-transform duration-300 ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "var(--ease-drawer)" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              name={person.fullName}
              photoUrl={person.photoUrl}
              className="h-11 w-11 shrink-0 text-base ring-1 ring-hairline"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold text-ink">{person.fullName}</span>
              <span className="truncate text-xs text-subtle">
                {person.isBuilder ? "Builder" : "Producer"}
                {person.npn ? ` · NPN ${person.npn}` : ""}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline text-subtle transition hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          <DrawerGroup label="Account">
            <DrawerLink href="/producer/settings?section=account">Profile &amp; headshot</DrawerLink>
            <DrawerLink href="/producer/settings?section=goal">Goals &amp; projections</DrawerLink>
            <DrawerLink href="/producer/settings?section=policy-info">Policy contacts</DrawerLink>
          </DrawerGroup>

          {person.isBuilder ? (
            <DrawerGroup label="Connections">
              <DrawerLink
                href="/producer/settings?section=discord"
                right={
                  <span className={person.discordConnected ? "text-pos" : "text-mute"}>
                    {person.discordConnected ? "Connected" : "Not connected"}
                  </span>
                }
              >
                Discord
              </DrawerLink>
            </DrawerGroup>
          ) : null}

          <DrawerGroup label="Appearance">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-background/40 px-4 py-3 text-sm text-ink">
              Theme
              <ThemePills />
            </div>
          </DrawerGroup>
        </div>

        <div className="border-t border-hairline px-5 py-4">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full rounded-full border border-hairline px-3.5 py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function DrawerGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-[0.16em] text-mute">{label}</span>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function DrawerLink({
  href,
  right,
  children,
}: {
  href: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-background/40 px-4 py-3 text-sm text-ink transition hover:border-mute hover:bg-card-hi"
    >
      {children}
      {right ?? <span className="text-mute">&rsaquo;</span>}
    </Link>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
