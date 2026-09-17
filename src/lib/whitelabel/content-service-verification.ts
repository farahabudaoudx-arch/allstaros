import "server-only";

import { isWhitelabelLocalPilot } from "@/lib/local-pilot";

type FetchLike = typeof fetch;

export type AiVerificationResult =
  | {
      ok: true;
      providerName: "Anthropic";
      accountRef: "anthropic";
      accountLabel: "Anthropic API";
      billingUrl: string;
      configuration: { provider: "anthropic" };
    }
  | { ok: false; error: string };

export async function verifyAnthropicAccess(
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<AiVerificationResult> {
  if (isWhitelabelLocalPilot()) {
    return {
      ok: true,
      providerName: "Anthropic",
      accountRef: "anthropic",
      accountLabel: "Anthropic API",
      billingUrl: "https://console.anthropic.com/settings/billing",
      configuration: { provider: "anthropic" },
    };
  }

  try {
    const response = await fetchImpl("https://api.anthropic.com/v1/models?limit=1", {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "Anthropic access was denied. Confirm the customer API key and retry." };
    }
    if (!response.ok) {
      return { ok: false, error: "Anthropic access could not be verified. Retry after checking the provider status." };
    }
    return {
      ok: true,
      providerName: "Anthropic",
      accountRef: "anthropic",
      accountLabel: "Anthropic API",
      billingUrl: "https://console.anthropic.com/settings/billing",
      configuration: { provider: "anthropic" },
    };
  } catch {
    return { ok: false, error: "Anthropic access could not be verified. Retry after checking the provider status." };
  }
}

export type BunnyLibraryInput = {
  key: "recruiting" | "live" | "tutorials";
  libraryId: string;
  apiKey: string;
  cdnHostname?: string | null;
};

export type VideoVerificationResult =
  | {
      ok: true;
      providerName: "Bunny";
      accountRef: string;
      accountLabel: "Bunny Stream";
      billingUrl: string;
      configuration: {
        provider: "bunny";
        libraries: Record<string, { libraryId: string; cdnHostname?: string }>;
      };
    }
  | { ok: false; error: string };

type BunnyVideoConfiguration = {
  provider: "bunny";
  libraries: Record<string, { libraryId: string; cdnHostname?: string }>;
};

export async function verifyBunnyVideoAccess(
  libraries: BunnyLibraryInput[],
  fetchImpl: FetchLike = fetch,
): Promise<VideoVerificationResult> {
  const active = libraries.filter((item) => item.libraryId.trim() || item.apiKey.trim());
  const recruiting = active.find((item) => item.key === "recruiting");
  if (!recruiting?.libraryId.trim() || !recruiting.apiKey.trim()) {
    return { ok: false, error: "Bunny verification needs the primary training library ID and API key." };
  }
  for (const item of active) {
    if (!/^\d+$/.test(item.libraryId.trim()) || !item.apiKey.trim()) {
      return { ok: false, error: `Bunny ${item.key} library ID/key is incomplete.` };
    }
    try {
      const response = await fetchImpl(
        `https://video.bunnycdn.com/library/${encodeURIComponent(item.libraryId.trim())}/videos?page=1&itemsPerPage=1`,
        {
          method: "GET",
          headers: { AccessKey: item.apiKey.trim(), accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: `Bunny ${item.key} library access was denied. Confirm its library API key.` };
      }
      if (!response.ok) {
        return { ok: false, error: `Bunny ${item.key} library could not be verified.` };
      }
    } catch {
      return { ok: false, error: `Bunny ${item.key} library could not be verified.` };
    }
  }

  const configuration: BunnyVideoConfiguration = {
    provider: "bunny",
    libraries: {},
  };
  for (const item of active) {
    configuration.libraries[item.key] = {
      libraryId: item.libraryId.trim(),
      ...(item.cdnHostname?.trim()
        ? { cdnHostname: item.cdnHostname.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") }
        : {}),
    };
  }
  return {
    ok: true,
    providerName: "Bunny",
    accountRef: recruiting.libraryId.trim(),
    accountLabel: "Bunny Stream",
    billingUrl: "https://dash.bunny.net/stream",
    configuration,
  };
}
