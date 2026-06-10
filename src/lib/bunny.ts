// Bunny Stream integration — server-only. Lists the videos in a Stream library
// so they can be embedded in the training section.
//
// Configured with two env vars (see .env.example). They're namespaced per app
// because each Bunny library has its own key — these point at the "All Star
// recruiting app" library:
//   BUNNY_RECRUITING_LIBRARY_ID — the numeric library id
//   BUNNY_RECRUITING_API_KEY    — the library-level API key (Stream → library → API)
//
// The API key is a secret and lives only in the environment; it is never sent to
// the browser. Only the public embed URLs (library id + video guid) ever reach
// the client.

import type { Course, Program, Tone } from "@/lib/producer/trainings";

const BUNNY_API_BASE = "https://video.bunnycdn.com";
const BUNNY_EMBED_BASE = "https://iframe.mediadelivery.net/embed";

export type BunnyVideo = {
  guid: string;
  title: string;
  /** Length in seconds (0 if Bunny hasn't reported it yet). */
  lengthSeconds: number;
  /** Bunny encode status: 4 = finished/playable. */
  status: number;
  /** Ready-to-embed iframe URL. */
  embedUrl: string;
  /** Public poster image URL (loads in a browser <img>; Bunny blocks
   * referer-less requests, which browsers always send). Null if the library's
   * CDN hostname couldn't be resolved. */
  thumbnailUrl: string | null;
  /** ISO timestamp of when the video was uploaded to Bunny (not the date in
   * the filename — that's the content's publish date). Used to find the most
   * recently added videos. */
  dateUploaded: string;
};

type BunnyListResponse = {
  totalItems: number;
  currentPage: number;
  itemsPerPage: number;
  items: Array<{
    guid: string;
    title: string;
    length?: number;
    status?: number;
    dateUploaded?: string;
  }>;
};

/** Which Bunny library to talk to. Each app has its own library id + API key:
 *   "recruiting" → BUNNY_RECRUITING_* (the recruiting-app library)
 *   "live"       → BUNNY_LIVE_*       (the All Star Live Training library)
 *   "tutorials"  → BUNNY_TUTORIALS_*  (the licensing how-to videos) */
export type BunnyApp = "recruiting" | "live" | "tutorials";

function config(app: BunnyApp = "recruiting"): { libraryId: string; apiKey: string } | null {
  const libraryId =
    app === "live"
      ? process.env.BUNNY_LIVE_LIBRARY_ID
      : app === "tutorials"
        ? process.env.BUNNY_TUTORIALS_LIBRARY_ID
        : process.env.BUNNY_RECRUITING_LIBRARY_ID;
  const apiKey =
    app === "live"
      ? process.env.BUNNY_LIVE_API_KEY
      : app === "tutorials"
        ? process.env.BUNNY_TUTORIALS_API_KEY
        : process.env.BUNNY_RECRUITING_API_KEY;
  if (!libraryId || !apiKey) return null;
  return { libraryId, apiKey };
}

/** True once both Bunny env vars for the given library are present. */
export function isBunnyConfigured(app: BunnyApp = "recruiting"): boolean {
  return config(app) !== null;
}

/** Build the public embed URL for a video guid in the given library. */
export function bunnyEmbedUrl(guid: string, app: BunnyApp = "recruiting"): string | null {
  const cfg = config(app);
  if (!cfg) return null;
  return `${BUNNY_EMBED_BASE}/${cfg.libraryId}/${guid}`;
}

// The library's CDN ("pull zone") hostname — needed to build thumbnail URLs —
// isn't returned by the per-library video API. It IS public on every embed
// page (as the og:image host), so we resolve it from a sample video and cache
// it for the process. An explicit env var short-circuits the lookup.
//
// Known-good hostnames per library id: a public, stable fallback used when the
// embed-page scrape fails (it can be flaky from a datacenter IP, which would
// otherwise drop every thumbnail back to the colored monogram tile).
const KNOWN_CDN_HOSTS: Record<string, string> = {
  "675288": "vz-316b0bb9-a9f.b-cdn.net", // All Star recruiting app library
  "677701": "vz-eea2b1a7-946.b-cdn.net", // All Star Live Training library
};

// Cache the resolved CDN host per library id (two libraries can be in play).
const cachedCdnHost: Record<string, string> = {};

async function resolveCdnHost(
  sampleGuid: string,
  app: BunnyApp = "recruiting",
): Promise<string | null> {
  const fromEnv =
    app === "live"
      ? process.env.BUNNY_LIVE_CDN_HOSTNAME
      : app === "tutorials"
        ? process.env.BUNNY_TUTORIALS_CDN_HOSTNAME
        : process.env.BUNNY_RECRUITING_CDN_HOSTNAME;
  if (fromEnv) {
    return fromEnv.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
  const cfg = config(app);
  if (!cfg) return null;
  if (cachedCdnHost[cfg.libraryId]) return cachedCdnHost[cfg.libraryId];
  try {
    const res = await fetch(`${BUNNY_EMBED_BASE}/${cfg.libraryId}/${sampleGuid}`, {
      headers: { "user-agent": "Mozilla/5.0" },
      // The hostname is stable for the life of the library — cache it for a day.
      next: { revalidate: 86400 },
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/https:\/\/(vz-[a-z0-9-]+\.b-cdn\.net)\//i);
      if (m) {
        cachedCdnHost[cfg.libraryId] = m[1];
        return m[1];
      }
    }
  } catch {
    // Scrape failed — fall through to the known-good fallback below.
  }
  // Fallback so thumbnails still render even when the scrape can't reach Bunny.
  const known = KNOWN_CDN_HOSTS[cfg.libraryId];
  if (known) {
    cachedCdnHost[cfg.libraryId] = known;
    return known;
  }
  return null;
}

/**
 * List every video in the configured Bunny library (handles pagination).
 * Returns an empty array if Bunny isn't configured, so callers can degrade
 * gracefully rather than throw.
 */
export async function listBunnyVideos(
  app: BunnyApp = "recruiting",
): Promise<BunnyVideo[]> {
  const cfg = config(app);
  if (!cfg) return [];

  const perPage = 100;
  const out: BunnyVideo[] = [];

  for (let page = 1; ; page++) {
    const url = `${BUNNY_API_BASE}/library/${cfg.libraryId}/videos?page=${page}&itemsPerPage=${perPage}&orderBy=date`;
    const res = await fetch(url, {
      headers: { AccessKey: cfg.apiKey, accept: "application/json" },
      // Refresh at most every 5 minutes — the library changes rarely.
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      throw new Error(
        `Bunny list failed: ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as BunnyListResponse;

    for (const item of body.items ?? []) {
      out.push({
        guid: item.guid,
        title: item.title,
        lengthSeconds: item.length ?? 0,
        status: item.status ?? 0,
        embedUrl: `${BUNNY_EMBED_BASE}/${cfg.libraryId}/${item.guid}`,
        thumbnailUrl: null,
        dateUploaded: item.dateUploaded ?? "",
      });
    }

    const seen = page * perPage;
    if (!body.items?.length || seen >= (body.totalItems ?? 0)) break;
  }

  // Resolve the CDN host once and decorate every video with its poster URL.
  if (out.length > 0) {
    const host = await resolveCdnHost(out[0].guid, app);
    if (host) {
      for (const v of out) {
        v.thumbnailUrl = `https://${host}/${v.guid}/thumbnail.jpg`;
      }
    }
  }

  return out;
}

/**
 * The licensing tutorial videos, ordered by the numeric filename prefix
 * (01, 02, …) so each one lines up with its licensing step. Returns [] when the
 * tutorials library isn't configured, so the page falls back to placeholders.
 */
export async function listTutorialVideos(): Promise<BunnyVideo[]> {
  const videos = await listBunnyVideos("tutorials");
  return videos.sort(byFilenameOrder);
}

const TONES: Tone[] = ["coral", "gold", "green", "sky", "violet", "rose"];

/**
 * Strip the bookkeeping noise out of a raw upload filename so it reads like a
 * lesson title. Handles the export naming we see in the library, e.g.
 *   "01 - 20260531 - How To Present Numbers… [VtMWOPWFKJQ].mp4"
 * → "How To Present Numbers…"
 */
function cleanTitle(raw: string): string {
  let t = raw.trim();
  t = t.replace(/\.(mp4|mov|m4v|webm|mkv)$/i, ""); // file extension
  t = t.replace(/\s*\[[^\]]*\]\s*$/, ""); // trailing [youtube-id]
  t = t.replace(/^\s*\d{1,3}\s*[-–]\s*/, ""); // leading "01 - " order index
  t = t.replace(/^\s*\d{8}\s*[-–]\s*/, ""); // leading "20260531 - " date
  return t.trim() || raw.trim();
}

/** Leading order index from a filename ("01 - …" → 1), or a large fallback so
 * unnumbered videos sort to the end while keeping the library order. */
function orderIndex(raw: string): number {
  const m = raw.trim().match(/^(\d{1,3})\s*[-–]/);
  return m ? Number.parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

function durationLabel(seconds: number): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")} mins`;
}

/**
 * Build a CoursePlatform Program from a Bunny library. Each video becomes one
 * "course" so the left rail lists every training and the right pane plays the
 * selected one in a real Bunny embed. Sorted by the numeric prefix in the
 * filename (01, 02, …) so the series plays in order.
 */
// The N most-recently-uploaded videos are treated as "Case Studies"; everything
// older is the evergreen "Content" library.
const CASE_STUDY_COUNT = 10;

function byFilenameOrder(a: BunnyVideo, b: BunnyVideo): number {
  const oi = orderIndex(a.title) - orderIndex(b.title);
  return oi !== 0 ? oi : a.title.localeCompare(b.title);
}

export function bunnyTrainingProgram(videos: BunnyVideo[]): Program {
  // The case studies are the most recent uploads (by Bunny upload time).
  const caseStudyGuids = new Set(
    [...videos]
      .sort((a, b) => Date.parse(b.dateUploaded) - Date.parse(a.dateUploaded))
      .slice(0, CASE_STUDY_COUNT)
      .map((v) => v.guid),
  );

  const content = videos
    .filter((v) => !caseStudyGuids.has(v.guid))
    .sort(byFilenameOrder);
  const caseStudies = videos
    .filter((v) => caseStudyGuids.has(v.guid))
    .sort(byFilenameOrder);

  // Content first, then case studies — the array order also drives tab order.
  const courses: Course[] = [...content, ...caseStudies].map((v, i) => ({
    id: v.guid,
    title: cleanTitle(v.title),
    blurb: "",
    description: "",
    category: "Training",
    level: "All levels" as const,
    status: "active" as const,
    rating: 5,
    ratingCount: 0,
    tone: TONES[i % TONES.length],
    // No real instructor metadata from Bunny — leave it empty so the
    // CoursePlatform hides the avatar block beneath the player.
    instructor: { name: "", title: "" },
    durationLabel: durationLabel(v.lengthSeconds),
    embedUrl: v.embedUrl,
    thumbnailUrl: v.thumbnailUrl ?? undefined,
    section: caseStudyGuids.has(v.guid) ? "case_studies" : "content",
    lectures: [],
  }));

  return {
    key: "launchpad",
    title: "All Star Training",
    subtitle: "Watch the full training series, in order.",
    filters: [],
    sections: [
      { key: "content", label: "Content" },
      { key: "case_studies", label: "Case Studies" },
    ],
    courses,
  };
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * Parse the session date out of a live-training title. The library is titled
 * "Month D, YYYY - Name …" (e.g. "December 5, 2025 - Justin Caleb Reeves"), so
 * the date is the sort key. Returns a sortable timestamp, or null if the title
 * isn't in that format (those sort to the end).
 */
function parseTitleDate(title: string): number | null {
  const m = title.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;
  return Date.UTC(Number(m[3]), month, Number(m[2]));
}

/**
 * Build the "Previous Live Trainings" Program from the live library, newest
 * first, as a single flat list. Each recording becomes one course; the date in
 * the title drives the order (see parseTitleDate). Titles that don't carry a
 * date (e.g. a not-yet-renamed upload) fall to the bottom.
 */
export function liveTrainingProgram(videos: BunnyVideo[]): Program {
  const sorted = [...videos].sort((a, b) => {
    const da = parseTitleDate(a.title);
    const db = parseTitleDate(b.title);
    // Newest first; undated entries sink to the end.
    return (db ?? -Infinity) - (da ?? -Infinity);
  });

  const courses: Course[] = sorted.map((v, i) => ({
    id: v.guid,
    title: cleanTitle(v.title),
    blurb: "",
    description: "",
    category: "Live Training",
    level: "All levels" as const,
    status: "completed" as const,
    rating: 5,
    ratingCount: 0,
    tone: TONES[i % TONES.length],
    instructor: { name: "", title: "" },
    durationLabel: durationLabel(v.lengthSeconds),
    embedUrl: v.embedUrl,
    thumbnailUrl: v.thumbnailUrl ?? undefined,
    section: "all",
    lectures: [],
  }));

  return {
    key: "live",
    title: "Previous Live Trainings",
    subtitle: "Recordings of past team calls, workshops, and guest sessions.",
    filters: [],
    // A single section renders as one flat, chronological list (no status tabs).
    sections: [{ key: "all", label: "All Trainings" }],
    courses,
  };
}
