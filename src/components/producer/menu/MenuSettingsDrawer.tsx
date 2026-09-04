"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/Avatar";
import { ThemePills } from "@/components/ThemeToggle";
import type { NpnStatus } from "@/lib/db/types";
import { HeadshotUpload } from "@/components/producer/HeadshotUpload";
import { ProfileSettingsForm } from "@/components/producer/ProfileSettingsForm";
import { PolicyContactSettingsForm } from "@/components/producer/PolicyContactSettingsForm";
import { NpnSettingsForm } from "@/components/producer/NpnSettingsForm";
import { BuilderSettingsForm } from "@/components/producer/BuilderSettingsForm";
import { DiscordSettingsSection } from "@/components/producer/DiscordSettingsSection";
import { GatewayConnectionSettings } from "@/components/producer/GatewayConnectionSettings";
import { gatewayStatusLabel, type GatewayConnectionState } from "@/lib/gateway/connection-types";

/** Slide duration, kept in sync with the `duration-300` classes below. */
const DRAWER_MS = 300;

export type MenuPerson = {
  fullName: string;
  email: string;
  npn: string | null;
  npnStatus: NpnStatus;
  isBuilder: boolean;
  photoUrl: string | null;
  photoRejectionReason: string | null;
  discordConnected: boolean;
  gatewayConnection: GatewayConnectionState;
};

/** The settings sections, in the order they appear in the drawer. */
export type SettingsSectionKey =
  | "policy-info"
  | "account"
  | "npn"
  | "gateway"
  | "builder"
  | "discord";

type Section = {
  key: SettingsSectionKey;
  title: string;
  /** One line under the title in the list, and above the form once opened. */
  description: string;
  content: ReactNode;
};

function sectionsFor(person: MenuPerson): Section[] {
  return [
    {
      key: "policy-info",
      title: "Policy Info Details",
      description:
        "The contact details clients see on the policy summary you send them, under “Your Client Coverage Specialist.” Leave any field blank to use your account details.",
      content: <PolicyContactSettingsForm />,
    },
    {
      key: "account",
      title: "Account Details",
      description:
        "Your headshot, plus the name, sign-in email, and phone number for this account. These can differ from your policy info.",
      content: (
        <div className="flex flex-col gap-10">
          <HeadshotUpload
            heading="Update your headshot"
            currentName={person.fullName}
            currentPhotoUrl={person.photoUrl}
            rejectionReason={person.photoRejectionReason}
          />
          <ProfileSettingsForm />
        </div>
      ),
    },
    {
      key: "npn",
      title: "Producer Number (NPN)",
      description:
        "Your National Producer Number. We use it to issue your IP reports inside the platform. Once an admin verifies it, it’s locked here.",
      content: (
        <NpnSettingsForm initialNpn={person.npn ?? ""} status={person.npnStatus} />
      ),
    },
    {
      key: "gateway",
      title: "Gateway",
      description:
        "Connect or disconnect your personal Gateway login. Gateway-driven numbers stay unknown whenever the connection cannot be verified.",
      content: <GatewayConnectionSettings state={person.gatewayConnection} />,
    },
    ...(person.isBuilder
      ? [
          {
            key: "builder" as const,
            title: "Builder details",
            description:
              "Your recruiting invite code, plus the admin email and code your recruits use for contracting.",
            content: <BuilderSettingsForm />,
          },
          {
            key: "discord" as const,
            title: "Discord",
            description:
              "Post sales and team leaderboards to your Discord channels. Leaderboards track submitted AP for you and your full downline.",
            content: <DiscordSettingsSection />,
          },
        ]
      : []),
  ];
}

/**
 * Right-side settings drawer opened from the avatar button on every screen.
 * This IS Settings now — the old standalone /producer/settings page is gone,
 * and that route redirects here. Level one is the list of sections; tapping one
 * swaps the drawer body for that section's real form, with a back arrow.
 *
 * `initialSection` opens straight into a section, which is how the deep links
 * (the headshot-rejection email, for one) still land where they used to.
 */
export function MenuSettingsDrawer({
  person,
  open,
  initialSection,
  onClose,
}: {
  person: MenuPerson;
  open: boolean;
  initialSection?: SettingsSectionKey | null;
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

  // Which section is open, or null for the list. Reset every time the drawer
  // opens so it never reopens mid-form, unless a deep link asked for one.
  const [openKey, setOpenKey] = useState<SettingsSectionKey | null>(null);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setOpenKey(initialSection ?? null);
      // Paint one frame in the closed position first, so the slide-in
      // actually transitions instead of snapping straight to open.
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const timer = setTimeout(() => setPresent(false), DRAWER_MS);
    return () => clearTimeout(timer);
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) return;
    // Escape backs out of a section first, and only closes the drawer from the
    // list, so it never throws away a half-filled form in one keystroke.
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (openKey) setOpenKey(null);
      else onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, openKey, onClose]);

  if (!mounted || !present) return null;

  const sections = sectionsFor(person);
  const current = sections.find((s) => s.key === openKey) ?? null;

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
        className={`relative flex h-full w-full max-w-xl flex-col border-l border-hairline bg-card transition-transform duration-300 ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "var(--ease-drawer)" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4">
          {current ? (
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setOpenKey(null)}
                aria-label="Back to settings"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline text-subtle transition hover:border-mute hover:text-ink"
              >
                <BackIcon />
              </button>
              <span className="truncate text-sm font-semibold text-ink">
                {current.title}
              </span>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                name={person.fullName}
                photoUrl={person.photoUrl}
                className="h-11 w-11 shrink-0 text-base ring-1 ring-hairline"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-ink">{person.fullName}</span>
                <span className="truncate text-xs text-subtle">{person.email}</span>
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline text-subtle transition hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        {current ? (
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <p className="max-w-prose text-sm text-subtle">{current.description}</p>
            <div className="mt-6">{current.content}</div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
            <DrawerGroup label="Settings">
              {sections.map((section) => (
                <DrawerRow
                  key={section.key}
                  onClick={() => setOpenKey(section.key)}
                  right={
                    section.key === "npn" && person.npn ? (
                      <span className="text-mute">{person.npn}</span>
                    ) : section.key === "gateway" ? (
                      <span className={person.gatewayConnection.connected ? "text-pos" : "text-mute"}>
                        {gatewayStatusLabel(person.gatewayConnection)}
                      </span>
                    ) : section.key === "discord" ? (
                      <span className={person.discordConnected ? "text-pos" : "text-mute"}>
                        {person.discordConnected ? "Connected" : "Not connected"}
                      </span>
                    ) : undefined
                  }
                >
                  {section.title}
                </DrawerRow>
              ))}
            </DrawerGroup>

            <DrawerGroup label="Appearance">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-background/40 px-4 py-3 text-sm text-ink">
                Theme
                <ThemePills />
              </div>
            </DrawerGroup>
          </div>
        )}

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

function DrawerRow({
  onClick,
  right,
  children,
}: {
  onClick: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-background/40 px-4 py-3 text-left text-sm text-ink transition hover:border-mute hover:bg-card-hi"
    >
      {children}
      <span className="flex shrink-0 items-center gap-2 text-xs">
        {right}
        <span className="text-mute">&rsaquo;</span>
      </span>
    </button>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M12 4l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
