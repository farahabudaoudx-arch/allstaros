"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { BugReportModal } from "@/components/BugReportModal";
import {
  MenuSettingsDrawer,
  type MenuPerson,
  type SettingsSectionKey,
} from "./menu/MenuSettingsDrawer";

const SETTINGS_SECTIONS: SettingsSectionKey[] = [
  "policy-info",
  "account",
  "npn",
  "builder",
  "discord",
];

/**
 * The four persistent controls that frame every producer screen: logo and
 * avatar across the top, bug report and chat across the bottom.
 *
 * This used to live inside MenuScreen, so the whole frame vanished the moment
 * you left a menu for an actual page. It's a layout now, shared by the menu
 * screens and by every page under /producer/(app), so those controls stay put
 * wherever you are.
 *
 * The frame is pinned: the header and footer hold their place and only the
 * middle scrolls. Pages that fill the viewport themselves (the course player)
 * size against that middle region rather than the whole window.
 */
export function AppChrome({
  person,
  chatHref,
  unreadChat,
  children,
}: {
  person: MenuPerson;
  chatHref: string;
  unreadChat: boolean;
  children: ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState<SettingsSectionKey | null>(null);

  // `?settings=<section>` opens the drawer straight into that section. Settings
  // has no page of its own any more, so the old /producer/settings links (and
  // the ones we email out) redirect here and land through this. Read from
  // window rather than useSearchParams: this component wraps every producer
  // screen, and useSearchParams would force a Suspense boundary around all of
  // them. The URL is then cleaned so a refresh doesn't reopen the drawer.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("settings");
    if (!wanted) return;
    setSettingsOpen(true);
    setSection(
      (SETTINGS_SECTIONS as string[]).includes(wanted)
        ? (wanted as SettingsSectionKey)
        : null,
    );
    params.delete("settings");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-background text-ink">
      <header className="flex shrink-0 items-start justify-between gap-6 px-5 pt-8 md:px-10">
        <Link href="/producer" aria-label="All Star OS home">
          <Image
            src="/logo.png"
            alt="All Star OS"
            width={120}
            height={68}
            priority
            className="app-logo h-9 w-auto"
          />
        </Link>
        <button
          type="button"
          onClick={() => {
            setSection(null);
            setSettingsOpen(true);
          }}
          aria-label="Open settings"
          className="rounded-full"
        >
          <Avatar
            name={person.fullName}
            photoUrl={person.photoUrl}
            className="h-11 w-11 text-base ring-1 ring-hairline"
          />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>

      <footer className="flex shrink-0 items-center justify-between gap-4 px-5 pb-6 pt-4 md:px-10">
        <BugReportModal variant="icon" />
        <Link
          href={chatHref}
          aria-label="Chat"
          title="Chat"
          className="relative flex h-14 w-14 items-center justify-center rounded-full border border-hairline text-subtle transition will-change-transform hover:-translate-y-0.5 hover:border-accent hover:text-accent"
        >
          <ChatIcon />
          {unreadChat ? (
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background" />
          ) : null}
        </Link>
      </footer>

      <MenuSettingsDrawer
        person={person}
        open={settingsOpen}
        initialSection={section}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path
        d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.1-3.4A7.96 7.96 0 0 1 4 12z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
