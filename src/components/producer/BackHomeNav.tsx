"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/** Per-tab record of how many distinct pages this tab has visited, and which
 *  page it was last on. sessionStorage (not local) is deliberate: "can I go
 *  back?" is a property of one tab's history, and must not leak between tabs. */
const DEPTH_KEY = "as:nav-depth";
const LAST_PATH_KEY = "as:nav-last-path";

/** Count one page view for this tab, ignoring re-renders and reloads of the
 *  page we are already on. */
function recordVisit(pathname: string): void {
  try {
    if (sessionStorage.getItem(LAST_PATH_KEY) === pathname) return;
    const depth = Number(sessionStorage.getItem(DEPTH_KEY) ?? "0") + 1;
    sessionStorage.setItem(DEPTH_KEY, String(depth));
    sessionStorage.setItem(LAST_PATH_KEY, pathname);
  } catch {
    // Storage disabled; canGoBack() falls back to the referrer.
  }
}

/**
 * Whether popping history would land on another page of this app rather than
 * dumping the user out of it.
 *
 * `history.length` is not usable for this: a tab that started blank and then
 * loaded one page already reports 2, so trusting it sends Back to about:blank.
 * Next.js keeps no history index of its own (its state is just a route tree),
 * so the depth is counted here instead. One bump per distinct page this tab
 * has shown, which is exactly the question being asked.
 */
function canGoBack(): boolean {
  try {
    return Number(sessionStorage.getItem(DEPTH_KEY) ?? "0") > 1;
  } catch {
    // Private browsing / storage disabled. Referrer is the only signal left.
    // A self-referrer means a plain reload, not a previous page. Counting it
    // would send Back to wherever the tab happened to be before this route.
    if (document.referrer === "") return false;
    const from = new URL(document.referrer);
    return from.origin === location.origin && from.pathname !== location.pathname;
  }
}

/**
 * The Back + Home action pair that sits under the title on every producer page.
 *
 * Back walks the browser history, so it returns to the page the user actually
 * came from rather than a hardcoded parent. Home is a separate control because
 * history-back alone can strand someone several steps deep in a flow with no
 * cheap way out to the menu. The pair gives them both moves.
 *
 * `fallbackHref` is only used when there is no history entry to pop: a page
 * opened in a new tab, restored from a bookmark, or linked to from an email.
 * Those are exactly the entries where a dead Back button is most confusing, so
 * every call site still passes the old parent route to land on.
 */
export function BackHomeNav({
  fallbackHref,
  homeHref = "/producer",
}: {
  fallbackHref: string;
  homeHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Log the visit, nothing more. Deliberately not render state: the buttons
  // look identical either way, so keeping this out of React avoids both a
  // server/client hydration mismatch and a needless second render, and lets
  // the click read the freshest count rather than one captured at mount.
  useEffect(() => recordVisit(pathname), [pathname]);

  return (
    <div className="flex items-center gap-[13px]">
      <button
        type="button"
        onClick={() => (canGoBack() ? router.back() : router.push(fallbackHref))}
        className="inline-flex h-[32px] items-center justify-center gap-[6px] rounded-[8px] border border-transparent bg-accent px-[18px] text-[12px] font-semibold tracking-[-0.02em] text-[#050505] shadow-[0_4px_15px_-6px_rgba(246,201,69,0.5)] transition hover:bg-accent-soft"
      >
        <BackArrowIcon />
        <span>Back</span>
      </button>

      {/* A real link, not a button: Home is a destination, so cmd-click and
          "open in new tab" should work. It carries the press-scale explicitly
          because the global :active rule only covers button/[role=button]. */}
      <Link
        href={homeHref}
        aria-label="Home"
        className="inline-flex size-[32px] items-center justify-center rounded-[8px] border border-hairline text-ink transition hover:border-accent/40 hover:bg-accent/[0.06] hover:text-accent active:scale-[0.96]"
      >
        <HomeIcon />
      </Link>
    </div>
  );
}

function BackArrowIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19.5 12H5.5" />
      <path d="m11.5 18.5-6.5-6.5 6.5-6.5" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M11.29 2.4a1.1 1.1 0 0 1 1.42 0l8.6 7.3A1.1 1.1 0 0 1 20.6 11.7H19.4v8.2a1.4 1.4 0 0 1-1.4 1.4h-3.35v-5.4a.9.9 0 0 0-.9-.9h-2.5a.9.9 0 0 0-.9.9v5.4H6a1.4 1.4 0 0 1-1.4-1.4v-8.2H3.4A1.1 1.1 0 0 1 2.69 9.7Z"
      />
    </svg>
  );
}
