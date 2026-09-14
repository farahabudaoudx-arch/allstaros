import "server-only";

import {
  findBunnyCollectionId,
  getLicensingVideos,
  isBunnyConfigured,
  listBunnyVideos,
  type BunnyApp,
  type BunnyVideo,
  type LicensingVideos,
} from "@/lib/bunny";
import { getInstallationServiceBinding } from "@/lib/services/bindings";

export type VideoServiceResult<T> =
  | { status: "ready"; provider: "bunny"; data: T }
  | { status: "unconfigured"; message: string }
  | { status: "unsupported"; message: string }
  | { status: "error"; message: string };

async function providerKey(app: BunnyApp): Promise<string | null> {
  const binding = await getInstallationServiceBinding("video");
  if (binding) {
    if (binding.status === "not_required" || binding.status === "missing") return null;
    return binding.providerKey;
  }
  const fromEnv = process.env.INSTALLATION_VIDEO_PROVIDER?.trim().toLowerCase();
  if (fromEnv) return fromEnv;
  return isBunnyConfigured(app) ? "bunny" : null;
}

export async function listInstallationVideos(
  app: BunnyApp = "recruiting",
  collectionId?: string,
): Promise<VideoServiceResult<BunnyVideo[]>> {
  const provider = await providerKey(app);
  if (!provider) {
    return {
      status: "unconfigured",
      message: "Video hosting is not connected for this installation yet.",
    };
  }
  if (provider !== "bunny") {
    return {
      status: "unsupported",
      message: `The configured video provider (${provider}) needs its purchased provider adapter before this library can load.`,
    };
  }
  try {
    return { status: "ready", provider: "bunny", data: await listBunnyVideos(app, collectionId) };
  } catch {
    return {
      status: "error",
      message: "The connected video service could not be reached. Existing unrelated OS features are still available.",
    };
  }
}

export async function findInstallationVideoCollection(
  name: string,
  app: BunnyApp = "recruiting",
): Promise<VideoServiceResult<string | null>> {
  const provider = await providerKey(app);
  if (!provider) {
    return {
      status: "unconfigured",
      message: "Video hosting is not connected for this installation yet.",
    };
  }
  if (provider !== "bunny") {
    return {
      status: "unsupported",
      message: `The configured video provider (${provider}) needs its purchased provider adapter before this library can load.`,
    };
  }
  try {
    return { status: "ready", provider: "bunny", data: await findBunnyCollectionId(name, app) };
  } catch {
    return { status: "error", message: "The connected video service could not be reached." };
  }
}

const EMPTY_LICENSING_VIDEOS: LicensingVideos = {
  intro: { url: null, ratio: null },
  schedule: { url: null, ratio: null },
  study: { url: null, ratio: null },
  exam: { url: null, ratio: null },
  contracting: { url: null, ratio: null },
};

export async function getInstallationLicensingVideos(): Promise<LicensingVideos> {
  const provider = await providerKey("tutorials");
  if (provider !== "bunny") return EMPTY_LICENSING_VIDEOS;
  try {
    return await getLicensingVideos();
  } catch {
    return EMPTY_LICENSING_VIDEOS;
  }
}

export type InstallationVideoCollectionKey = "agent_vlogs" | "live_dials" | "case_studies";

const DEFAULT_COLLECTION_NAMES: Record<InstallationVideoCollectionKey, string> = {
  agent_vlogs: "All Star TV",
  live_dials: "Live Dials",
  case_studies: "Case Studies",
};

export function installationVideoCollectionName(key: InstallationVideoCollectionKey): string {
  const envKey = `INSTALLATION_VIDEO_COLLECTION_${key.toUpperCase()}`;
  return process.env[envKey]?.trim() || DEFAULT_COLLECTION_NAMES[key];
}
