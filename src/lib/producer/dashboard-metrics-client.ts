import type { DashboardResult, RangeKey } from "@/lib/producer/metrics";

/** API JSON for GET /api/producer/dashboard/metrics (success shape). */
export type DashboardMetricsResponse = DashboardResult & { ok: true };

export type FetchDashboardMetricsOpts = {
  range: RangeKey | string;
  tz?: string;
  from?: string | null;
  to?: string | null;
  /** Skip the short success cache (in-flight dedupe still applies). */
  bypassCache?: boolean;
};

// Collapses simultaneous identical requests (Goals + Overview both asking for
// MTD on mount). A brief success cache covers the same race when one finishes
// a few ms before the other starts. Failures are never cached so today and MTD
// cannot bleed into each other.
const SUCCESS_CACHE_MS = 8_000;
const inflight = new Map<string, Promise<DashboardMetricsResponse>>();
const successCache = new Map<string, { data: DashboardMetricsResponse; expiresAt: number }>();

export function dashboardMetricsCacheKey(opts: {
  range: string;
  tz: string;
  from?: string | null;
  to?: string | null;
}): string {
  const params = new URLSearchParams({ range: opts.range, tz: opts.tz });
  if (opts.range === "custom" && opts.from && opts.to) {
    params.set("from", opts.from);
    params.set("to", opts.to);
  }
  return params.toString();
}

/** Test helper — clears in-flight and success caches. */
export function clearDashboardMetricsClientCache(): void {
  inflight.clear();
  successCache.clear();
}

/**
 * Fetch dashboard metrics with in-flight dedupe + short success cache keyed by
 * the full query string (range + tz + optional custom bounds).
 */
export async function fetchDashboardMetrics(
  opts: FetchDashboardMetricsOpts,
): Promise<DashboardMetricsResponse> {
  const tz = opts.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const key = dashboardMetricsCacheKey({
    range: opts.range,
    tz,
    from: opts.from,
    to: opts.to,
  });

  if (!opts.bypassCache) {
    const hit = successCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.data;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async (): Promise<DashboardMetricsResponse> => {
    const res = await fetch(`/api/producer/dashboard/metrics?${key}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("load failed");
    const json = (await res.json()) as { ok?: boolean } & Partial<DashboardResult>;
    if (!json.ok) throw new Error("load failed");
    const data = json as DashboardMetricsResponse;
    successCache.set(key, { data, expiresAt: Date.now() + SUCCESS_CACHE_MS });
    return data;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}
