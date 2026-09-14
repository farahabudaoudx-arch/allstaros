"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BugReportModal } from "@/components/BugReportModal";
import type { InstallationBrand } from "@/lib/installation/types";

export type NavItem = {
  label: string;
  href?: string;
  children?: NavItem[];
  locked?: boolean;
  /** Opens in a new tab via a plain anchor (e.g. an external dashboard). */
  external?: boolean;
  /** Shows an unread dot on the item (e.g. new messages). */
  dot?: boolean;
};

function UnreadDot() {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full bg-accent"
      aria-label="Unread"
    />
  );
}

function leafHrefs(items: NavItem[]): string[] {
  return items.flatMap((it) =>
    it.children?.length ? leafHrefs(it.children) : it.href ? [it.href] : [],
  );
}

function bestMatch(pathname: string, hrefs: string[]): string | undefined {
  // Longest-prefix match so nested routes highlight their section.
  return hrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
}

/**
 * Nav body shared by the desktop sidebar and the mobile drawer. `onNavigate`
 * fires when a leaf link is tapped so the mobile drawer can close itself; the
 * desktop sidebar passes nothing. `collapsed` only applies to the desktop rail.
 */
function NavBody({
  items,
  active,
  open,
  toggleGroup,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  active: string | undefined;
  open: Record<string, boolean>;
  toggleGroup: (label: string) => void;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
      {items.map((it) => {
        if (it.children?.length) {
          const childHrefs = leafHrefs(it.children);
          const groupActive = childHrefs.includes(active ?? "");
          const isOpen = !collapsed && open[it.label];
          return (
            <div key={it.label}>
              <button
                type="button"
                onClick={() => toggleGroup(it.label)}
                title={collapsed ? it.label : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  collapsed ? "justify-center" : ""
                } ${
                  groupActive
                    ? "text-ink"
                    : "text-subtle hover:bg-card-hi/60 hover:text-ink"
                }`}
              >
                {collapsed ? (
                  <span className="text-sm font-semibold">
                    {it.label.trim()[0]?.toUpperCase()}
                  </span>
                ) : (
                  <>
                    <span className="flex-1 truncate text-left">{it.label}</span>
                    <span
                      aria-hidden
                      className={`text-mute transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    >
                      ›
                    </span>
                  </>
                )}
              </button>
              {isOpen ? (
                <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-hairline pl-3">
                  {it.children.map((child) =>
                    child.locked ? (
                      <div
                        key={child.label}
                        title={`${child.label} is locked`}
                        className="flex cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2 text-sm text-mute/70"
                      >
                        <span className="flex-1 truncate">{child.label}</span>
                        <LockIcon />
                      </div>
                    ) : child.external ? (
                      <a
                        key={child.label}
                        href={child.href ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={onNavigate}
                        className="flex items-center gap-1 truncate rounded-lg px-3 py-2 text-sm text-subtle transition hover:bg-card-hi/60 hover:text-ink"
                      >
                        <span className="truncate">{child.label}</span>
                        <span aria-hidden className="text-mute">
                          ↗
                        </span>
                      </a>
                    ) : (
                      <Link
                        key={child.href}
                        href={child.href ?? "#"}
                        onClick={onNavigate}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                          active === child.href
                            ? "bg-card-hi text-ink ring-1 ring-hairline"
                            : "text-subtle hover:bg-card-hi/60 hover:text-ink"
                        }`}
                      >
                        <span className="flex-1 truncate">{child.label}</span>
                        {child.dot ? <UnreadDot /> : null}
                      </Link>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          );
        }

        if (it.locked) {
          return (
            <div
              key={it.label}
              title={`${it.label} unlocks once you schedule your exam and get your study login`}
              className={`flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-mute/70 ${
                collapsed ? "justify-center" : ""
              }`}
            >
              {collapsed ? (
                <LockIcon />
              ) : (
                <>
                  <span className="flex-1 truncate">{it.label}</span>
                  <LockIcon />
                </>
              )}
            </div>
          );
        }

        return (
          <Link
            key={it.href}
            href={it.href ?? "#"}
            onClick={onNavigate}
            title={collapsed ? it.label : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              collapsed ? "justify-center" : ""
            } ${
              active === it.href
                ? "bg-card-hi text-ink ring-1 ring-hairline"
                : "text-subtle hover:bg-card-hi/60 hover:text-ink"
            }`}
          >
            {collapsed ? (
              <span className="relative text-sm font-semibold">
                {it.label.trim()[0]?.toUpperCase()}
                {it.dot ? (
                  <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-accent" />
                ) : null}
              </span>
            ) : (
              <>
                <span className="flex-1 truncate">{it.label}</span>
                {it.dot ? <UnreadDot /> : null}
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({
  initial,
  userName,
  collapsed,
}: {
  initial: string;
  userName?: string;
  collapsed: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-hairline px-3 py-4">
      <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card-hi text-sm font-semibold text-ink ring-1 ring-hairline">
          {initial}
        </div>
        {!collapsed && userName ? (
          <span className="truncate text-sm text-subtle">{userName}</span>
        ) : null}
      </div>

      {!collapsed ? (
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full rounded-full border border-hairline px-3.5 py-2 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
          >
            Sign out
          </button>
        </form>
      ) : null}

      <BugReportModal collapsed={collapsed} />

      <ThemeToggle collapsed={collapsed} />
    </div>
  );
}

export function Sidebar({
  items,
  tag,
  userName,
  brand,
}: {
  items: NavItem[];
  tag?: string;
  userName?: string;
  brand?: InstallationBrand;
}) {
  const pathname = usePathname() ?? "";
  const initial = userName?.trim()?.[0]?.toUpperCase() ?? "A";
  const allHrefs = leafHrefs(items);
  const active = bestMatch(pathname, allHrefs);

  // Desktop rail is always expanded for now; mobile uses the drawer instead.
  const collapsed = false;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const it of items) {
      if (it.children?.length) {
        init[it.label] = leafHrefs(it.children).includes(active ?? "");
      }
    }
    return init;
  });

  // Close the mobile drawer whenever the route changes (a link was tapped).
  useEffect(() => {
    setMobileOpen(false);
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

  function toggleGroup(label: string) {
    setOpen((o) => ({ ...o, [label]: !o[label] }));
  }

  const brandLink = (
    <Link
      href={items[0]?.href ?? "/"}
      className="flex items-center gap-3 overflow-hidden"
      onClick={() => setMobileOpen(false)}
    >
      {/* Dynamic customer logos can live on the customer's own storage domain,
          so a plain image avoids baking provider hostnames into next.config. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brand?.logoUrl ?? "/logo.png"}
        alt={brand?.productName ?? "All Star OS"}
        className="app-logo h-9 w-auto shrink-0"
      />
      {tag ? (
        <span className="whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-mute">
          {tag}
        </span>
      ) : null}
    </Link>
  );

  return (
    <>
      {/* Desktop rail (md and up) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-hairline bg-card/30 md:flex">
        <div className="flex items-center justify-between gap-2 px-4 py-4">{brandLink}</div>
        <NavBody
          items={items}
          active={active}
          open={open}
          toggleGroup={toggleGroup}
          collapsed={collapsed}
        />
        <SidebarFooter initial={initial} userName={userName} collapsed={collapsed} />
      </aside>

      {/* Mobile top bar (below md) */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-hairline bg-background/80 px-4 backdrop-blur-md md:hidden">
        {brandLink}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline text-ink transition hover:bg-card-hi"
        >
          <MenuIcon />
        </button>
      </header>

      {/* Mobile drawer + backdrop (below md). Kept mounted so the slide
          transitions both in and out; CSS transitions are interruptible. */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${
          mobileOpen ? "" : "pointer-events-none"
        }`}
        inert={!mobileOpen}
      >
        <div
          onClick={() => setMobileOpen(false)}
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
          <div className="flex items-center justify-between gap-2 px-4 py-4">
            {brandLink}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline text-ink transition hover:bg-card-hi"
            >
              <CloseIcon />
            </button>
          </div>
          <NavBody
            items={items}
            active={active}
            open={open}
            toggleGroup={toggleGroup}
            collapsed={collapsed}
            onNavigate={() => setMobileOpen(false)}
          />
          <SidebarFooter initial={initial} userName={userName} collapsed={collapsed} />
        </div>
      </div>
    </>
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

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <rect
        x="4.5"
        y="9"
        width="11"
        height="7.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M7 9V6.8a3 3 0 016 0V9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
