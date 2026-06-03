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

function config(): { libraryId: string; apiKey: string } | null {
  const libraryId = process.env.BUNNY_RECRUITING_LIBRARY_ID;
  const apiKey = process.env.BUNNY_RECRUITING_API_KEY;
  if (!libraryId || !apiKey) return null;
  return { libraryId, apiKey };
}

/** True once both Bunny env vars are present. */
export function isBunnyConfigured(): boolean {
  return config() !== null;
}

/** Build the public embed URL for a video guid in the configured library. */
export function bunnyEmbedUrl(guid: string): string | null {
  const cfg = config();
  if (!cfg) return null;
  return `${BUNNY_EMBED_BASE}/${cfg.libraryId}/${guid}`;
}

// The library's CDN ("pull zone") hostname — needed to build thumbnail URLs —
// isn't returned by the per-library video API. It IS public on every embed
// page (as the og:image host), so we resolve it once from a sample video and
// cache it for the process. An explicit env var short-circuits the lookup.
let cachedCdnHost: string | null = null;

async function resolveCdnHost(sampleGuid: string): Promise<string | null> {
  const fromEnv = process.env.BUNNY_RECRUITING_CDN_HOSTNAME;
  if (fromEnv) {
    return fromEnv.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
  if (cachedCdnHost) return cachedCdnHost;
  const cfg = config();
  if (!cfg) return null;
  try {
    const res = await fetch(`${BUNNY_EMBED_BASE}/${cfg.libraryId}/${sampleGuid}`, {
      headers: { "user-agent": "Mozilla/5.0" },
      // The hostname is stable for the life of the library — cache it for a day.
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/https:\/\/(vz-[a-z0-9-]+\.b-cdn\.net)\//i);
    if (m) {
      cachedCdnHost = m[1];
      return cachedCdnHost;
    }
  } catch {
    // Best-effort: thumbnails just won't render, callers fall back gracefully.
  }
  return null;
}

/**
 * List every video in the configured Bunny library (handles pagination).
 * Returns an empty array if Bunny isn't configured, so callers can degrade
 * gracefully rather than throw.
 */
export async function listBunnyVideos(): Promise<BunnyVideo[]> {
  const cfg = config();
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
    const host = await resolveCdnHost(out[0].guid);
    if (host) {
      for (const v of out) {
        v.thumbnailUrl = `https://${host}/${v.guid}/thumbnail.jpg`;
      }
    }
  }

  return out;
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
