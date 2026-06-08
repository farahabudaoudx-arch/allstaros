import { createClient } from "@/lib/supabase/server";

/** A DB row from training_schedule. */
export type ScheduleRow = {
  id: string;
  slug: string;
  title: string;
  host: string;
  initials: string;
  image: string | null;
  kicker: string | null;
  event_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM[:SS]
  end_time: string;
  timezone: string;
  zoom_url: string | null;
  sort_order: number;
};

/** The display shape consumed by EventSchedule / EventCard. */
export type ScheduleEvent = {
  slug: string;
  day: string; // e.g. "Mon"
  date: string; // e.g. "5/11"
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  kicker?: string;
  title: string;
  host: string;
  initials: string;
  image: string;
  timeZone: string;
  zoomUrl: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_ZOOM =
  "https://us02web.zoom.us/j/87144901286?pwd=Q0FuQXFDbXJ3ZjFSbVV1Wm95ZzNsUT09";

// Parse a date-only string into day-of-week + M/D without timezone drift.
function formatDay(eventDate: string): { day: string; date: string } {
  const [y, m, d] = eventDate.split("-").map(Number);
  if (!y || !m || !d) return { day: "", date: eventDate };
  const dt = new Date(Date.UTC(y, m - 1, d));
  return { day: WEEKDAYS[dt.getUTCDay()], date: `${m}/${d}` };
}

function hhmm(t: string): string {
  return (t ?? "").slice(0, 5);
}

export function rowToEvent(row: ScheduleRow): ScheduleEvent {
  const { day, date } = formatDay(row.event_date);
  return {
    slug: row.slug,
    day,
    date,
    startDate: row.event_date,
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    kicker: row.kicker ?? undefined,
    title: row.title,
    host: row.host,
    initials: row.initials,
    image: row.image ?? "",
    timeZone: row.timezone || "America/Chicago",
    zoomUrl: row.zoom_url || DEFAULT_ZOOM,
  };
}

/**
 * Upcoming training events for the producer dashboard, in display order.
 * Only events from today onward are shown, so past weeks' trainings drop off
 * automatically — admins just add the new week's events in /admin/schedule.
 * "Today" is computed in the app's timezone (America/Chicago).
 */
export async function getScheduleEvents(): Promise<ScheduleEvent[]> {
  const supabase = await createClient();
  // en-CA formats as YYYY-MM-DD, matching the date column.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
  }).format(new Date());
  const { data } = await supabase
    .from("training_schedule")
    .select(
      "id, slug, title, host, initials, image, kicker, event_date, start_time, end_time, timezone, zoom_url, sort_order",
    )
    .gte("event_date", today)
    .order("sort_order", { ascending: true })
    .order("event_date", { ascending: true });
  return ((data ?? []) as ScheduleRow[]).map(rowToEvent);
}
