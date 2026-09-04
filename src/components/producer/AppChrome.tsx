"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { BugReportModal } from "@/components/BugReportModal";
import {
  AppSidebar,
  SidebarToggle,
  SidebarTrigger,
} from "@/components/producer/AppSidebar";
import {
  MenuSettingsDrawer,
  type MenuPerson,
  type SettingsSectionKey,
} from "./menu/MenuSettingsDrawer";

import { GatewayConnectPrompt } from "@/app/producer/_components/gateway-connect-prompt";
import { shouldPromptGatewayConnection } from "@/lib/gateway/connection-types";
const RAIL_KEY = "producer.nav.rail";

const SETTINGS_SECTIONS: SettingsSectionKey[] = [
  "policy-info",
  "account",
  "npn",
  "gateway",
  "builder",
  "discord",
];

/**
 * The persistent frame around every producer screen: the nav sidebar down the
 * left, logo and avatar across the top, bug report and chat across the bottom.
 *
 * On desktop the logo sits at the top of the sidebar, so the header only
 * carries the avatar. On mobile the sidebar becomes a drawer and the header
 * carries its hamburger.
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
  alwaysOpenRail = false,
  children,
}: {
  person: MenuPerson;
  chatHref: string;
  unreadChat: boolean;
  /** Ignore a remembered "collapsed" and land with the rail open. Set on the
   *  home screen: it's where you get your bearings, so the nav should be
   *  in front of you. Collapsing it there still works and still sticks. */
  alwaysOpenRail?: boolean;
  children: ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState<SettingsSectionKey | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);

  // Desktop rail. Starts open so the server and client markup match, then the
  // remembered preference is applied on mount. `railAnimated` stays false until
  // after that first paint, so a remembered "collapsed" appears already
  // collapsed instead of sliding shut every time you load a page.
  const [railOpen, setRailOpen] = useState(true);
  const [railAnimated, setRailAnimated] = useState(false);
  const toggleRail = useCallback(() => {
    setRailOpen((prev) => {
      try {
        window.localStorage.setItem(RAIL_KEY, prev ? "0" : "1");
      } catch {
        // Preference is optional; the toggle still works for this session.
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    try {
      if (!alwaysOpenRail && window.localStorage.getItem(RAIL_KEY) === "0") {
        setRailOpen(false);
      }
    } catch {
      // A blocked localStorage just means the rail stays open.
    }
    const id = requestAnimationFrame(() => setRailAnimated(true));
    return () => cancelAnimationFrame(id);
  }, [alwaysOpenRail]);

  // ⌘B / Ctrl+B, the shortcut people already expect from editors.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "b" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      toggleRail();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleRail]);

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
    <div className="flex h-dvh bg-background text-ink">
      <AppSidebar
        isBuilder={person.isBuilder}
        mobileOpen={navOpen}
        onCloseMobile={closeNav}
        desktopOpen={railOpen}
        onToggleDesktop={toggleRail}
        animated={railAnimated}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-6 px-5 pt-8 md:items-start md:px-10">
          <SidebarTrigger onClick={() => setNavOpen(true)} />
          {/* The toggle normally lives in the sidebar's own top-right corner;
              it reappears here once the rail is gone, so there's a way back. */}
          {railOpen ? null : <SidebarToggle expanded={false} onClick={toggleRail} />}
          <Link href="/producer" aria-label="All Star OS home" className="md:hidden">
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
            className="rounded-full md:ml-auto"
          >
            <Avatar
              name={person.fullName}
              photoUrl={person.photoUrl}
              className="h-11 w-11 text-base ring-1 ring-hairline"
            />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {children}
        </div>

        {/* Bug report and chat, in a slim row under the page.

            These were floated over the bottom corners for a while, to kill the
            tall dead strip they used to sit in. That worked only while the page
            was narrow enough to leave margins for them: on a phone, or on any
            desktop window where the content column reaches the edges, the chat
            bubble landed on top of whatever was bottom-right. On the tracker
            that was the "Add New Client" button, unclickable even scrolled all
            the way down.

            So: back in flow, where it can never cover anything, but roughly half
            the height of the original strip. */}
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 pb-4 pt-2 md:px-10">
          <BugReportModal variant="icon" />
          <Link
            href={chatHref}
            aria-label="Chat"
            title="Chat"
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-background text-subtle transition will-change-transform hover:-translate-y-0.5 hover:border-accent hover:text-accent"
          >
            <ChatIcon />
            {unreadChat ? (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background" />
            ) : null}
          </Link>
        </div>
      </div>

      <MenuSettingsDrawer
        person={person}
        open={settingsOpen}
        initialSection={section}
        onClose={() => setSettingsOpen(false)}
      />
      <GatewayConnectPrompt
        initialOpen={shouldPromptGatewayConnection(person.gatewayConnection)}
        reconnect={person.gatewayConnection.needsReconnect || person.gatewayConnection.everConnected}
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
