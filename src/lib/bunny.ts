// Bunny Stream integration — server-only. Lists the videos in a Stream library
// so they can be embedded in the training section.
//
// Configured with two env vars (see .env.example):
//   BUNNY_STREAM_LIBRARY_ID — the numeric library id
//   BUNNY_STREAM_API_KEY     — the library-level API key (Stream → library → API)
//
// The API key is a secret and lives only in the environment; it is never sent to
// the browser. Only the public embed URLs (library id + video guid) ever reach
// the client.

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
  }>;
};

function config(): { libraryId: string; apiKey: string } | null {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
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
      });
    }

    const seen = page * perPage;
    if (!body.items?.length || seen >= (body.totalItems ?? 0)) break;
  }

  return out;
}
