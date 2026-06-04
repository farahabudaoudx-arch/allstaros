"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

export type NavItem = {
  label: string;
  href?: string;
  children?: NavItem[];
  locked?: boolean;
};

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

export function Sidebar({
  items,
  tag,
  userName,
}: {
  items: NavItem[];
  tag?: string;
  userName?: string;
}) {
  const pathname = usePathname() ?? "";
  const initial = userName?.trim()?.[0]?.toUpperCase() ?? "A";
  const allHrefs = leafHrefs(items);
  const active = bestMatch(pathname, allHrefs);

  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const it of items) {
      if (it.children?.length) {
        init[it.label] = leafHrefs(it.children).includes(active ?? "");
      }
    }
    return init;
  });

  function toggleGroup(label: string) {
    if (collapsed) setCollapsed(false);
    setOpen((o) => ({ ...o, [label]: !o[label] }));
  }

  return (
    <aside
      className={`sticky top-0 flex h-dvh shrink-0 flex-col border-r border-hairline bg-card/30 transition-[width] duration-200 ${
        collapsed ? "w-[72px]" : "w-60"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <Link
          href={items[0]?.href ?? "/"}
          className="flex items-center gap-3 overflow-hidden"
        >
          <Image
            src="/logo.png"
            alt="All Star OS"
            width={120}
            height={68}
            priority
            className="app-logo h-9 w-auto shrink-0"
          />
          {!collapsed && tag ? (
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
              {tag}
            </span>
          ) : null}
        </Link>
      </div>

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
                      <span className="flex-1 truncate text-left">
                        {it.label}
                      </span>
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
                  <div className="mt-1 flex flex-col gap-0.5 border-l border-hairline pl-3 ml-5">
                    {it.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href ?? "#"}
                        className={`truncate rounded-lg px-3 py-2 text-sm transition ${
                          active === child.href
                            ? "bg-card-hi text-ink ring-1 ring-hairline"
                            : "text-subtle hover:bg-card-hi/60 hover:text-ink"
                        }`}
                      >
                        {child.label}
                      </Link>
                    ))}
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
                <span className="text-sm font-semibold">
                  {it.label.trim()[0]?.toUpperCase()}
                </span>
              ) : (
                <span className="truncate">{it.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3 border-t border-hairline px-3 py-4">
        <div
          className={`flex items-center gap-3 ${
            collapsed ? "justify-center" : ""
          }`}
        >
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

        <ThemeToggle collapsed={collapsed} />

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          className={`flex items-center gap-2 rounded-full border border-hairline px-3 py-2 text-xs font-medium text-subtle transition hover:border-mute hover:text-ink ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <span aria-hidden className="text-base leading-none">
            {collapsed ? "»" : "«"}
          </span>
          {!collapsed ? <span>Collapse</span> : null}
        </button>
      </div>
    </aside>
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
