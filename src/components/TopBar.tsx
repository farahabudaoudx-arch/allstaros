"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

export type NavItem = { label: string; href: string };

function isActive(pathname: string, items: NavItem[], href: string): boolean {
  // Longest-prefix match so nested routes (e.g. /dashboard/recruits/123)
  // highlight their section, and "/dashboard" doesn't swallow everything.
  const matches = items
    .filter((it) => pathname === it.href || pathname.startsWith(it.href + "/"))
    .sort((a, b) => b.href.length - a.href.length);
  const best = matches[0]?.href ?? items[0]?.href;
  return best === href;
}

export function TopBar({
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

  return (
    <header className="border-b border-hairline">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-10">
        <div className="flex items-center gap-6">
          <Link href={items[0]?.href ?? "/"} className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="All Star OS"
              width={120}
              height={68}
              priority
              className="app-logo h-9 w-auto"
            />
            {tag ? (
              <span className="hidden text-[10px] uppercase tracking-[0.18em] text-mute sm:inline">
                {tag}
              </span>
            ) : null}
          </Link>
          <nav className="hidden items-center gap-7 text-sm md:flex">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={
                  isActive(pathname, items, it.href)
                    ? "text-ink"
                    : "text-subtle transition hover:text-ink"
                }
              >
                {it.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {userName ? (
            <span className="hidden text-sm text-subtle md:inline">
              {userName}
            </span>
          ) : null}
          <ThemeToggle variant="icon" />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-full border border-hairline px-3.5 py-2 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              Sign out
            </button>
          </form>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-card-hi text-sm font-semibold text-ink ring-1 ring-hairline">
            {initial}
          </div>
        </div>
      </div>
    </header>
  );
}
