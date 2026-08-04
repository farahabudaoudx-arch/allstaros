"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AddToCalendarButton } from "add-to-calendar-button-react";
import { PageHeader } from "@/components/producer/PageHeader";

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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

/** "2026-08-04" → { y: 2026, m: 7, d: 4 } (m is 0-indexed), no timezone drift. */
function parseDate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y || 0, m: (m || 1) - 1, d: d || 1 };
}

function monthLabel(y: number, m: number): string {
  return new Date(Date.UTC(y, m, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function EventSchedule({
  events,
  heading = "Training Calendar",
  emptyState = null,
  backHref = "/producer/menu/training",
  action = null,
}: {
  events: EventItem[];
  heading?: string;
  /** Rendered when there are no events. Defaults to nothing (section hides). */
  emptyState?: ReactNode;
  /** Fallback for the Back control when there is no history to pop. */
  backHref?: string;
  /** Sits above the List/Calendar tabs — the way out to past recordings. */
  action?: ReactNode;
}) {
  // Two ways to read the same schedule: a straight list (fastest to scan when
  // there are only a handful of calls) and a month grid (better for "what does
  // the week after next look like"). List stays the default.
  const [view, setView] = useState<"list" | "calendar">("list");

  if (events.length === 0) return <>{emptyState}</>;

  return (
    <section>
      <PageHeader title={heading} backHref={backHref}>
        {action}
        <div className="flex items-center gap-5 border-b border-hairline">
          {(["list", "calendar"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`-mb-px border-b-2 pb-2.5 text-sm capitalize transition ${
                view === v
                  ? "border-accent font-medium text-ink"
                  : "border-transparent text-subtle hover:text-ink"
              }`}
            >
              {v === "list" ? "List" : "Calendar"}
            </button>
          ))}
        </div>
      </PageHeader>

      {view === "list" ? (
        <div className="grid grid-cols-1 gap-3">
          {events.map((e) => (
            <EventCard key={e.slug} event={e} />
          ))}
        </div>
      ) : (
        <CalendarView events={events} />
      )}
    </section>
  );
}

/** Month grid. Days that hold trainings list them inline; picking one opens the
 *  training in a popup with the add-to-calendar action. */
function CalendarView({ events }: { events: EventItem[] }) {
  const start = parseDate(events[0].startDate);
  const [cursor, setCursor] = useState({ y: start.y, m: start.m });
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // Today is read after mount only: the server renders in UTC and the browser
  // in local time, so computing it during render can differ between the two.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const now = new Date();
    setToday(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate(),
      ).padStart(2, "0")}`,
    );
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const e of events) {
      const list = map.get(e.startDate);
      if (list) list.push(e);
      else map.set(e.startDate, [e]);
    }
    return map;
  }, [events]);

  // Months that actually hold trainings, so the arrows can't wander off into
  // empty months forever.
  const months = useMemo(() => {
    const seen = new Set<string>();
    return events
      .map((e) => parseDate(e.startDate))
      .filter((p) => {
        const key = `${p.y}-${p.m}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((p) => ({ y: p.y, m: p.m }));
  }, [events]);

  const index = months.findIndex((p) => p.y === cursor.y && p.m === cursor.m);
  const prev = index > 0 ? months[index - 1] : null;
  const next = index >= 0 && index < months.length - 1 ? months[index + 1] : null;

  const leading = new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const open = events.find((e) => e.slug === openSlug) ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em] md:text-xl">
          {monthLabel(cursor.y, cursor.m)}
        </h2>
        <div className="flex items-center gap-2">
          <MonthArrow
            direction="prev"
            disabled={!prev}
            onClick={() => prev && setCursor(prev)}
          />
          <MonthArrow
            direction="next"
            disabled={!next}
            onClick={() => next && setCursor(next)}
          />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 md:gap-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-xs text-mute">
            <span className="hidden sm:inline">{w}</span>
            <span className="sm:hidden">{w[0]}</span>
          </div>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <div key={`pad-${i}`} />;
          const iso = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = byDate.get(iso) ?? [];
          const isToday = today === iso;
          return (
            <div
              key={iso}
              className={`min-h-[76px] rounded-xl border p-1.5 md:min-h-[110px] md:p-2 ${
                dayEvents.length > 0
                  ? "border-accent/30 bg-accent/[0.04]"
                  : "border-hairline bg-card"
              }`}
            >
              <span
                className={`text-xs tabular-nums ${isToday ? "font-semibold text-accent" : "text-mute"}`}
              >
                {day}
              </span>
              <div className="mt-1 space-y-1">
                {dayEvents.map((e) => (
                  <button
                    key={e.slug}
                    type="button"
                    onClick={() => setOpenSlug(e.slug)}
                    className="block w-full rounded-md bg-card-hi px-1.5 py-1 text-left text-[11px] leading-tight text-ink transition hover:bg-accent hover:text-[#050505]"
                  >
                    <span className="line-clamp-2 font-medium">{e.title}</span>
                    <span className="mt-0.5 hidden text-[10px] opacity-70 md:block">
                      {formatTime(e.startTime)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <EventModal event={open} onClose={() => setOpenSlug(null)} />
    </div>
  );
}

/**
 * Popup for one training, opened from a day in the month grid. Same details as
 * the list card plus the add-to-calendar action, so nobody has to hunt for it
 * further down the page.
 */
function EventModal({ event, onClose }: { event: EventItem | null; onClose: () => void }) {
  const open = event !== null;

  // Lock background scroll while it's up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {event ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-black/80" aria-hidden onClick={onClose} />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={event.title}
            className="relative my-auto w-full max-w-md rounded-2xl border border-hairline bg-card p-7"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-lg text-mute transition hover:bg-card-hi hover:text-ink"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>

            <p className="pr-8 text-sm text-mute">
              {event.day} {event.date}
            </p>
            {event.kicker && (
              <p className="mt-1 text-sm font-medium text-accent">{event.kicker}</p>
            )}
            <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink">
              {event.title}
            </h2>
            <p className="mt-1.5 text-sm font-medium text-subtle">{event.host}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-mute">
              <span>{formatTime(event.startTime)} CST</span>
              <span aria-hidden>·</span>
              <span>{prettyLocation(event.zoomUrl)}</span>
            </div>

            <div className="mt-5 border-t border-hairline pt-4">
              <CalendarButton event={event} />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function MonthArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Previous month" : "Next month"}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-hairline text-ink transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-hairline disabled:hover:text-ink"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={direction === "next" ? "rotate-180" : undefined}
      >
        <path d="m14.5 19-7-7 7-7" />
      </svg>
    </button>
  );
}

// Upcoming trainings are informational only — not clickable (there's no event
// detail page). The single action is "Add to calendar" at the bottom.
function EventCard({ event }: { event: EventItem }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-hairline bg-card p-5">
      <div className="flex flex-1 flex-col">
        <div>
          <p className="text-sm text-mute">
            {event.day} {event.date}
          </p>
          {event.kicker && (
            <p className="mt-1 text-sm font-medium text-accent">{event.kicker}</p>
          )}
        </div>
        <div className="mt-5">
          <h3 className="text-lg font-semibold leading-tight tracking-[-0.01em] text-ink">
            {event.title}
          </h3>
          <p className="mt-1.5 text-sm font-medium text-subtle">{event.host}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-mute">
            <span>{formatTime(event.startTime)} CST</span>
            <span aria-hidden>·</span>
            <span>{prettyLocation(event.zoomUrl)}</span>
          </div>
        </div>
      </div>
      {/* flex-1 above grows so this button lines up at the card bottom across
          cards of different title lengths. */}
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
