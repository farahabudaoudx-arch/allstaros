"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AddToCalendarButton } from "add-to-calendar-button-react";

// The display shape now comes from the database (training_schedule), mapped in
// src/lib/producer/schedule.ts. Kept structurally identical to the old hardcoded
// items, plus per-event timeZone / zoomUrl.
type EventItem = {
  slug: string;
  day: string;
  date: string;
  startDate: string;
  startTime: string;
  endTime: string;
  kicker?: string;
  title: string;
  host: string;
  initials: string;
  image: string;
  timeZone: string;
  zoomUrl: string;
};

// "08:30" → "8:30 AM". Time is uniform (8:30 AM CST) across live trainings.
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${ap}`;
}

// "https://AllStarDials.com" → "AllStarDials.com".
function prettyLocation(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

export function EventSchedule({
  events,
  heading = "Training Schedule",
  emptyState = null,
  viewAllHref,
  singleColumn = false,
  showAvatar = true,
}: {
  events: EventItem[];
  heading?: string;
  /** Rendered when there are no events. Defaults to nothing (section hides). */
  emptyState?: ReactNode;
  /** When set, a "View all upcoming live trainings →" link shows in the header. */
  viewAllHref?: string;
  /** One training per row (the full Upcoming list) instead of a multi-col grid. */
  singleColumn?: boolean;
  /** Show the presenter initials avatar. Off for the plain Upcoming list. */
  showAvatar?: boolean;
}) {
  if (events.length === 0) return <>{emptyState}</>;
  return (
    <section className="mt-12">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
          {heading}
        </h2>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-sm font-medium text-accent hover:text-accent-soft"
          >
            View all upcoming live trainings →
          </Link>
        )}
      </div>
      <div className={`mt-6 grid gap-3 ${singleColumn ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        {events.map((e) => (
          <EventCard key={e.slug} event={e} showAvatar={showAvatar} />
        ))}
      </div>
    </section>
  );
}

function EventCard({ event, showAvatar = true }: { event: EventItem; showAvatar?: boolean }) {
  return (
    <div className="group flex h-full flex-col rounded-2xl border border-hairline bg-card p-5 transition hover:border-mute hover:bg-card-hi">
      <Link href={`/producer/events/${event.slug}`} className="flex flex-1 flex-col">
        <div className="flex items-center gap-4">
          {showAvatar && <Avatar src={event.image} initials={event.initials} />}
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
              {event.day} {event.date}
            </p>
            {event.kicker && (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                {event.kicker}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5">
          <h3 className="text-lg font-semibold uppercase leading-tight tracking-[0.01em] text-ink">
            {event.title}
          </h3>
          <p className="mt-1.5 text-sm font-medium text-subtle">{event.host}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-mute">
            <span>{formatTime(event.startTime)} CST</span>
            <span aria-hidden>·</span>
            <span>{prettyLocation(event.zoomUrl)}</span>
          </div>
        </div>
      </Link>
      {/* The Link above is flex-1, so it grows and pins this button to the card
          bottom — lining up across cards of different title lengths. */}
      <div className="mt-4 border-t border-hairline pt-4">
        <CalendarButton event={event} />
      </div>
    </div>
  );
}

// The add-to-calendar web component rewrites its own attributes on the client
// after init, which trips React hydration when server-rendered. Render it only
// after mount so there's no SSR markup to mismatch against.
function CalendarButton({ event }: { event: EventItem }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="text-sm text-mute">Add to calendar</span>;
  return (
    <AddToCalendarButton
      name={`${event.title} — ${event.host}`}
      startDate={event.startDate}
      startTime={event.startTime}
      endTime={event.endTime}
      timeZone={event.timeZone}
      location={event.zoomUrl}
      description={`Live training with ${event.host}.[br][br]Join at [url]${event.zoomUrl}|${prettyLocation(event.zoomUrl)}[/url]`}
      options={["Apple", "Google", "Outlook.com", "iCal"]}
      buttonStyle="text"
      size="3"
      lightMode="dark"
      label="Add to calendar"
    />
  );
}

function Avatar({ src, initials }: { src: string; initials: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-black">
      <span className="text-sm font-bold tracking-wide">{initials}</span>
      {!failed && src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
