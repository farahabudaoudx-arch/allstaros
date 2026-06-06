"use client";

import Link from "next/link";
import { useState } from "react";
import { AddToCalendarButton } from "add-to-calendar-button-react";

const TIME_ZONE = "America/Chicago";
const ZOOM_URL =
  "https://us02web.zoom.us/j/87144901286?pwd=Q0FuQXFDbXJ3ZjFSbVV1Wm95ZzNsUT09";

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
};

const events: EventItem[] = [
  {
    slug: "ring-of-objections",
    day: "Mon",
    date: "5/11",
    startDate: "2026-05-11",
    startTime: "08:30",
    endTime: "09:00",
    kicker: "Special Training",
    title: "Ring of Objections",
    host: "Preston Beck",
    initials: "PB",
    image: "/events/ring-of-objections.png",
  },
  {
    slug: "the-why",
    day: "Tue",
    date: "5/12",
    startDate: "2026-05-12",
    startTime: "08:30",
    endTime: "09:00",
    title: "The Why",
    host: "Graham Hatley",
    initials: "GH",
    image: "/events/the-why.png",
  },
  {
    slug: "financial-inventory",
    day: "Wed",
    date: "5/13",
    startDate: "2026-05-13",
    startTime: "08:30",
    endTime: "09:00",
    title: "Financial Inventory",
    host: "Ethan Fox",
    initials: "EF",
    image: "/events/financial-inventory.png",
  },
  {
    slug: "application-close",
    day: "Thu",
    date: "5/14",
    startDate: "2026-05-14",
    startTime: "08:30",
    endTime: "09:00",
    title: "Application & Close",
    host: "Aidan Abell",
    initials: "AA",
    image: "/events/application-close.png",
  },
];

export function EventSchedule() {
  return (
    <section className="mt-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
            Training Schedule
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
          timeZone={TIME_ZONE}
          location={ZOOM_URL}
          description={`Live training with ${event.host}.[br][br]Join on Zoom: [url]${ZOOM_URL}|Join Zoom Meeting[/url]`}
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
