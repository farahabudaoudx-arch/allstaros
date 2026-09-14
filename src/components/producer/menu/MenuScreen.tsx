"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AppChrome } from "@/components/producer/AppChrome";
import { AddPeopleModal } from "@/components/producer/AddPerson";
import { PageTransition } from "@/components/PageTransition";
import { type MenuPerson } from "./MenuSettingsDrawer";
import type { MenuTile } from "@/lib/producer/menu";
import type { InstallationBrand } from "@/lib/installation/types";

export type { MenuTile };

function greetingWord(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

/**
 * Full-bleed menu screen shared by the home menu and every submenu (Personal,
 * Resources, Training, Team, Recruits). Pass `greetingName` for the top-level
 * "Good Morning, Name." screens, or `title` + `backHref` for a drilled-in
 * submenu. Tiles link straight out to the app's real pages — this is only a
 * launcher, it never owns the destination content.
 */
export function MenuScreen({
  person,
  greetingName,
  title,
  tiles,
  chatHref,
  unreadChat,
  brand,
  columns = 3,
}: {
  person: MenuPerson;
  greetingName?: string;
  title?: string;
  /** Still accepted so callers don't all have to change at once, but nothing
   *  renders from it: the Back/Home pair went away with the sidebar. */
  backHref?: string;
  tiles: MenuTile[];
  chatHref: string;
  unreadChat: boolean;
  brand?: InstallationBrand;
  /** Tile grid column count at sm+ (mobile is always 2). Defaults to 3. */
  columns?: 2 | 3;
}) {
  const [greeting, setGreeting] = useState("Morning");
  // Which tile's invite popup is open, if any. Lives here rather than on the
  // tile so the dialog renders above the whole screen, not inside the grid.
  const [addTile, setAddTile] = useState<MenuTile | null>(null);
  // Computed client-side to avoid a server/client timezone mismatch, same
  // approach as the old DashboardGreeting.
  useEffect(() => {
    if (greetingName) setGreeting(greetingWord());
  }, [greetingName]);

  return (
    <AppChrome person={person} chatHref={chatHref} unreadChat={unreadChat} brand={brand}>
      <PageTransition className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-10 md:px-10">
        <main>
          {greetingName ? (
            <h1 className="mb-10 text-center text-[clamp(2.5rem,6vw,4rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
              Good {greeting}, <em className="text-accent not-italic">{greetingName}.</em>
            </h1>
          ) : (
            <div className="mb-10 text-center">
              <h1 className="text-[clamp(2rem,5vw,3rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
                {title}
              </h1>
            </div>
          )}

          <div
            className={`grid grid-cols-2 gap-5 sm:gap-6 ${columns === 2 ? "mx-auto max-w-md sm:grid-cols-2" : "sm:grid-cols-3"}`}
          >
            {tiles.map((tile) => (
              <MenuTileItem
                key={tile.label}
                tile={tile}
                onAddPeople={() => setAddTile(tile)}
              />
            ))}
          </div>
        </main>
      </PageTransition>

      {addTile?.addPeople ? (
        <AddPeopleModal
          title={addTile.addPeople.title}
          defaultRole={addTile.addPeople.role}
          onClose={() => setAddTile(null)}
        />
      ) : null}
    </AppChrome>
  );
}

function MenuTileItem({
  tile,
  onAddPeople,
}: {
  tile: MenuTile;
  onAddPeople: () => void;
}) {
  const art = (
    <span className="relative block aspect-square w-full max-w-[11rem]">
      {/* Hover glow. A pre-rendered radial layer whose OPACITY fades in, never
          a live drop-shadow filter on the image: animating a filter forces the
          browser to re-rasterize a huge region every frame, which flashed as
          black bars across large displays when moving between tiles. Opacity
          composites on the GPU with no repaint at all.

          The gradient itself lives in `--menu-tile-glow` (globals.css) because
          it has to be themed: light gold reads as a halo on the dark page but
          disappears on the light one, which needs a deep amber instead. That
          file also documents why the colour stops are tuned to the artwork
          rather than the box — change the inset here and the stops there must
          move with it, or the halo hides behind the icon. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-8 opacity-0 transition-opacity duration-150 ease-out will-change-[opacity] group-hover:opacity-100"
        style={{ background: "var(--menu-tile-glow)" }}
      />
      <Image src={tile.icon} alt="" fill sizes="176px" className="object-contain" />
    </span>
  );

  const body = (
    <span className="flex flex-col items-center gap-1 text-center">
      <span className="flex items-center gap-1.5 text-sm font-semibold tracking-[-0.02em] text-ink md:text-base">
        {tile.label}
        {tile.locked ? <LockIcon /> : null}
      </span>
      {tile.hint ? <span className="text-xs text-mute">{tile.hint}</span> : null}
    </span>
  );

  if (tile.locked || (!tile.href && !tile.addPeople)) {
    return (
      <div
        title={`${tile.label} is coming soon`}
        className="flex cursor-not-allowed flex-col items-center gap-3 rounded-2xl p-2 opacity-40"
      >
        {art}
        {body}
      </div>
    );
  }

  /* `will-change-transform` pre-promotes each tile's hover-lift layer at mount.
     Without it the browser builds the layer at hover time, which flashed
     unrasterized black bars on large displays (same artifact as the glow and
     drawer scrim fixes above/in MenuSettingsDrawer). Tiles are small, so the
     standing layers are cheap. */
  const className =
    "group flex flex-col items-center gap-3 rounded-2xl p-2 transition duration-150 ease-out will-change-transform hover:-translate-y-0.5";

  if (tile.addPeople) {
    return (
      <button type="button" onClick={onAddPeople} className={className}>
        {art}
        {body}
      </button>
    );
  }

  const href = tile.href ?? "";

  if (tile.external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {art}
        {body}
      </a>
    );
  }

  return (
    <Link href={href} className={`relative ${className}`}>
      {art}
      {tile.dot ? <span className="absolute right-6 top-0 h-2.5 w-2.5 rounded-full bg-accent" /> : null}
      {body}
    </Link>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3 shrink-0 text-mute" aria-hidden>
      <rect x="4.5" y="9" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9V6.8a3 3 0 016 0V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
