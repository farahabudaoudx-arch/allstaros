// Timezone-aware date helpers for the producer dashboard + analytics.
// Clients send an IANA tz with any request that buckets by day or hour; the
// server reads Y/M/D/H/DOW of a UTC timestamp *in that zone* so a 9pm-EDT dial
// doesn't get bucketed under the next day.

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export type ZonedParts = { y: number; m: number; day: number; h: number; dow: number };

export function zonedParts(d: Date, tz: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
    h: Number(parts.hour) % 24,
    dow: dowMap[parts.weekday] ?? 0,
  };
}

export function zonedIsoDay(d: Date, tz: string): string {
  const p = zonedParts(d, tz);
  return `${p.y}-${pad2(p.m)}-${pad2(p.day)}`;
}

// Validate an IANA tz string. Returns it if Intl accepts it, else the fallback.
export function safeTz(rawTz: string | null | undefined, fallback = "UTC"): string {
  if (!rawTz) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: rawTz }).format(new Date());
    return rawTz;
  } catch {
    return fallback;
  }
}

// YYYY-MM-DD in the caller's local timezone. On the client this is the browser
// tz — what the user means by "today".
export function localIsoDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
