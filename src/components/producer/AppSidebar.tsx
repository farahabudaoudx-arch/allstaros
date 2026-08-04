"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AddPeopleModal } from "@/components/producer/AddPerson";
import {
  activeHref,
  isGroup,
  navHrefs,
  producerNav,
  type NavGroup,
  type NavLink,
  type NavSection,
} from "@/lib/producer/nav";

/** Which groups the reader has opened. A NEW key on purpose: the old one
 *  stored the inverse (which groups were collapsed), so reusing it would read
 *  every remembered value backwards. */
const OPEN_GROUPS_KEY = "producer.nav.groups.open";

/**
 * Persistent nav for the producer app.
 *
 * Built off a data tree (lib/producer/nav) rather than hand-written markup, so
 * a producer and a builder render from the same source: the builder's
 * "Personal" block IS the producer's whole sidebar, with Team and Recruits
 * added below it.
 *
 * Two things the old sidebar could not do:
 *  - Section headings, so a builder's own numbers never blur into the team's.
 *  - Action items. "Add Team Member" and "Add Recruit" open the invite popup
 *    right where you are instead of navigating to a page to find a form.
 *
 * A rail on desktop, a drawer on mobile. The parent (AppChrome) owns both open
 * states because the buttons that restore them live in the header.
 */
export function AppSidebar({
  isBuilder,
  mobileOpen,
  onCloseMobile,
  desktopOpen,
  onToggleDesktop,
  animated,
}: {
  isBuilder: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  desktopOpen: boolean;
  onToggleDesktop: () => void;
  /** False for the first paint, so a remembered "collapsed" doesn't play the
   *  slide-out animation on every page load. */
  animated: boolean;
}) {
  const pathname = usePathname() ?? "";
  const sections = useMemo(() => producerNav(isBuilder), [isBuilder]);
  const active = useMemo(
    () => activeHref(pathname, navHrefs(sections)),
    [pathname, sections],
  );

  // Which invite popup is open, if any. Rendered from here so the dialog sits
  // above the whole app, not inside the scrolling rail.
  const [addLink, setAddLink] = useState<NavLink | null>(null);

  // Groups start CLOSED. Opening one is a preference, so it's remembered, but
  // it's read after mount to keep the server and client markup identical.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPEN_GROUPS_KEY);
      if (raw) setExpanded(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // A corrupt or blocked localStorage just means everything stays closed.
    }
  }, []);

  function toggleGroup(label: string) {
    setExpanded((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // Preference is optional; the toggle still works for this session.
      }
      return next;
    });
  }

  // Close the drawer whenever the route changes, i.e. a link was tapped.
  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const body = (
    <NavBody
      sections={sections}
      active={active}
      expanded={expanded}
      onToggleGroup={toggleGroup}
      onAdd={(link) => {
        setAddLink(link);
        onCloseMobile();
      }}
      onNavigate={onCloseMobile}
    />
  );

  return (
    <>
      {/* Desktop rail. Collapsing animates the width to zero rather than
          unmounting, so the nav slides out and back instead of popping. */}
      <aside
        inert={!desktopOpen}
        className={`hidden shrink-0 flex-col overflow-hidden md:flex ${
          animated ? "transition-[width] duration-300" : ""
        } ${desktopOpen ? "w-60 border-r border-hairline" : "w-0"}`}
        style={{ transitionTimingFunction: "var(--ease-drawer)" }}
      >
        {/* Fixed-width inner column: the content keeps its layout while the
            rail around it narrows, so nothing reflows mid-slide. */}
        <div className="flex min-h-0 w-60 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 px-5 pt-8">
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
            <SidebarToggle expanded onClick={onToggleDesktop} />
          </div>
          {body}
        </div>
      </aside>

      {/* Mobile drawer. Kept mounted so it slides both ways. */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${
          mobileOpen ? "" : "pointer-events-none"
        }`}
        inert={!mobileOpen}
      >
        <div
          onClick={onCloseMobile}
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`absolute left-0 top-0 flex h-dvh w-[82%] max-w-xs flex-col border-r border-hairline bg-card transition-transform duration-300 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ transitionTimingFunction: "var(--ease-drawer)" }}
        >
          <div className="flex items-center justify-between gap-2 px-5 pt-6">
            <Link
              href="/producer"
              aria-label="All Star OS home"
              onClick={onCloseMobile}
            >
              <Image
                src="/logo.png"
                alt="All Star OS"
                width={120}
                height={68}
                className="app-logo h-8 w-auto"
              />
            </Link>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline text-ink transition hover:bg-card-hi"
            >
              <CloseIcon />
            </button>
          </div>
          {body}
        </div>
      </div>

      {addLink?.add ? (
        <AddPeopleModal
          title={addLink.add.title}
          defaultRole={addLink.add.role}
          onClose={() => setAddLink(null)}
        />
      ) : null}
    </>
  );
}

/** The hamburger that opens the drawer. Lives in the AppChrome header so it
 *  lines up with the logo and avatar, but ships with the sidebar it drives. */
export function SidebarTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open menu"
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline text-ink transition hover:bg-card-hi md:hidden"
    >
      <MenuIcon />
    </button>
  );
}

/** Collapse/expand the desktop rail. Sits in the sidebar's own top-right
 *  corner while it's open, and moves to the same spot in the header once the
 *  rail has slid away, so there's always a way back. Desktop only. */
export function SidebarToggle({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  const label = expanded ? "Hide sidebar" : "Show sidebar";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={`${label} (⌘B)`}
      className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-mute transition hover:bg-card-hi hover:text-ink md:flex"
    >
      <PanelLeftIcon />
    </button>
  );
}

function PanelLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M9.5 4v16" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function NavBody({
  sections,
  active,
  expanded,
  onToggleGroup,
  onAdd,
  onNavigate,
}: {
  sections: NavSection[];
  active: string | undefined;
  expanded: Record<string, boolean>;
  onToggleGroup: (label: string) => void;
  onAdd: (link: NavLink) => void;
  onNavigate: () => void;
}) {
  return (
    <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-5">
      {sections.map((section, i) => (
        <div
          key={section.heading ?? `section-${i}`}
          // A rule between blocks, so a builder's own numbers read as separate
          // from the team's. The first block has nothing above it to divide.
          className={i > 0 ? "mt-5 border-t border-hairline pt-5" : undefined}
        >
          {section.heading ? (
            <h2 className="px-3 pb-1.5 text-sm font-semibold text-ink">
              {section.heading}
            </h2>
          ) : null}
          <div className="flex flex-col gap-0.5">
            {section.entries.map((entry) =>
              isGroup(entry) ? (
                <Group
                  key={entry.label}
                  group={entry}
                  active={active}
                  expanded={Boolean(expanded[entry.label])}
                  onToggle={() => onToggleGroup(entry.label)}
                  onNavigate={onNavigate}
                />
              ) : (
                <Item
                  key={entry.label}
                  link={entry}
                  active={active}
                  onAdd={onAdd}
                  onNavigate={onNavigate}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Group({
  group,
  active,
  expanded,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  active: string | undefined;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const holdsActive = group.items.some((it) => it.href === active);
  // Closed until you open it, and the toggle always wins. This used to force a
  // group open whenever it held the current page, on the theory that the
  // sidebar should always show where you are — but it meant clicking Training
  // while on a training page did nothing at all, which just reads as broken.
  // The header stays highlighted while closed, so you can still see which
  // group you're inside.
  const open = expanded;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm transition ${
          holdsActive ? "text-ink" : "text-subtle hover:bg-card-hi/60 hover:text-ink"
        }`}
      >
        <NavIcon src={group.icon} />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <span
          aria-hidden
          className={`text-mute transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>
      {/* The indent is tighter than it used to be: the icons carry it visually
          now, so the old margin was only stealing room from the labels. */}
      {open ? (
        <div className="ml-2.5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2.5">
          {group.items.map((item) => (
            <Item
              key={item.label}
              link={item}
              active={active}
              onAdd={() => {}}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ITEM_BASE =
  "flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm transition";

/**
 * The item's picture at rail size, or an empty slot the same width.
 *
 * These are the tile-menu illustrations shrunk right down. The slot is always
 * rendered, art or not, so labels stay on one vertical line instead of stepping
 * in and out wherever a picture happens to exist.
 */
function NavIcon({ src }: { src?: string }) {
  if (!src) return <span aria-hidden className="h-7 w-7 shrink-0" />;
  return (
    <Image
      src={src}
      alt=""
      width={64}
      height={64}
      className="h-7 w-7 shrink-0 object-contain"
    />
  );
}
const ITEM_IDLE = "text-subtle hover:bg-card-hi/60 hover:text-ink";
const ITEM_ACTIVE = "bg-card-hi text-ink ring-1 ring-hairline";

function Item({
  link,
  active,
  onAdd,
  onNavigate,
}: {
  link: NavLink;
  active: string | undefined;
  onAdd: (link: NavLink) => void;
  onNavigate: () => void;
}) {
  if (link.locked) {
    return (
      <span
        title={`${link.label} is coming soon`}
        className={`${ITEM_BASE} cursor-not-allowed text-subtle opacity-40`}
      >
        <NavIcon src={link.icon} />
        <span className="flex-1 truncate">{link.label}</span>
      </span>
    );
  }

  if (link.add) {
    return (
      <button
        type="button"
        onClick={() => onAdd(link)}
        className={`${ITEM_BASE} ${ITEM_IDLE} w-full text-left`}
      >
        <NavIcon src={link.icon} />
        <span className="flex-1 truncate">{link.label}</span>
      </button>
    );
  }

  if (link.external) {
    return (
      <a
        href={link.href ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={`${ITEM_BASE} ${ITEM_IDLE}`}
      >
        <NavIcon src={link.icon} />
        <span className="flex-1 truncate">{link.label}</span>
      </a>
    );
  }

  const isActive = link.href === active;
  return (
    <Link
      href={link.href ?? "#"}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={`${ITEM_BASE} ${isActive ? ITEM_ACTIVE : ITEM_IDLE}`}
    >
      <NavIcon src={link.icon} />
      <span className="flex-1 truncate">{link.label}</span>
    </Link>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden>
      <path
        d="M10 4v12M4 10h12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
