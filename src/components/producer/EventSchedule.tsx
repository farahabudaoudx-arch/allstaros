"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
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

export function EventSchedule({
  events,
  heading = "Training Schedule",
  emptyState = null,
}: {
  events: EventItem[];
  heading?: string;
  /** Rendered when there are no events. Defaults to nothing (section hides). */
  emptyState?: ReactNode;
}) {
  if (events.length === 0) return <>{emptyState}</>;
  return (
    <section className="mt-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
            {heading}
          </h2>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {events.map((e) => (
          <EventCard key={e.slug} event={e} />
        ))}
      </div>
    </section>
  );
}

function EventCard({ event }: { event: EventItem }) {
  return (
    <div className="group flex flex-col rounded-2xl border border-hairline bg-card p-5 transition hover:border-mute hover:bg-card-hi">
      <Link href={`/producer/events/${event.slug}`} className="flex flex-col">
        <div className="flex items-center gap-4">
          <Avatar src={event.image} initials={event.initials} />
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
          <p className="mt-1.5 text-sm italic text-subtle">— {event.host}</p>
        </div>
      </Link>
      <div className="mt-4 border-t border-hairline pt-4">
        <AddToCalendarButton
          name={`${event.title} — ${event.host}`}
          startDate={event.startDate}
          startTime={event.startTime}
          endTime={event.endTime}
          timeZone={event.timeZone}
          location={event.zoomUrl}
          description={`Live training with ${event.host}.[br][br]Join on Zoom: [url]${event.zoomUrl}|Join Zoom Meeting[/url]`}
          options={["Apple", "Google", "Outlook.com", "iCal"]}
          buttonStyle="text"
          size="3"
          lightMode="dark"
          label="Add to calendar"
        />
      </div>
    </div>
  );
}

function Avatar({ src, initials }: { src: string; initials: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-black">
      <span className="text-sm font-bold tracking-wide">{initials}</span>
      {!failed && (
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
