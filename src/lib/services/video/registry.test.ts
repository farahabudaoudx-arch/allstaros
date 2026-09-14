import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  binding: vi.fn(),
  list: vi.fn(),
  find: vi.fn(),
  licensing: vi.fn(),
  configured: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/bindings", () => ({ getInstallationServiceBinding: mocks.binding }));
vi.mock("@/lib/bunny", () => ({
  listBunnyVideos: mocks.list,
  findBunnyCollectionId: mocks.find,
  getLicensingVideos: mocks.licensing,
  isBunnyConfigured: mocks.configured,
}));

import {
  findInstallationVideoCollection,
  getInstallationLicensingVideos,
  installationVideoCollectionName,
  listInstallationVideos,
} from "./registry";

describe("installation video adapter registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured.mockReturnValue(false);
  });

  it("reports an honest unconfigured state instead of throwing", async () => {
    mocks.binding.mockResolvedValue(null);
    const result = await listInstallationVideos();
    expect(result).toMatchObject({ status: "unconfigured" });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("does not silently route an unsupported paid replacement through Bunny", async () => {
    mocks.binding.mockResolvedValue({ status: "configured", providerKey: "mux" });
    const result = await listInstallationVideos();
    expect(result).toMatchObject({ status: "unsupported" });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("uses the registered Bunny adapter and isolates provider failures", async () => {
    mocks.binding.mockResolvedValue({ status: "configured", providerKey: "bunny" });
    mocks.find.mockResolvedValue("collection-1");
    mocks.list.mockRejectedValue(new Error("provider body with secrets"));
    expect(await findInstallationVideoCollection("Case Studies")).toMatchObject({ status: "ready", data: "collection-1" });
    const result = await listInstallationVideos("recruiting", "collection-1");
    expect(result).toMatchObject({ status: "error" });
    expect(JSON.stringify(result)).not.toContain("provider body with secrets");
  });

  it("keeps licensing optional and hides provider failures behind null videos", async () => {
    mocks.binding.mockResolvedValue({ status: "configured", providerKey: "bunny" });
    mocks.licensing.mockRejectedValue(new Error("secret provider failure"));
    const result = await getInstallationLicensingVideos();
    expect(result.intro.url).toBeNull();
    expect(result.contracting.url).toBeNull();
    expect(JSON.stringify(result)).not.toContain("secret provider failure");
  });

  it("uses customer collection names from env while preserving the All Star default", () => {
    delete process.env.INSTALLATION_VIDEO_COLLECTION_AGENT_VLOGS;
    expect(installationVideoCollectionName("agent_vlogs")).toBe("All Star TV");
    process.env.INSTALLATION_VIDEO_COLLECTION_AGENT_VLOGS = "Agency Vlogs";
    expect(installationVideoCollectionName("agent_vlogs")).toBe("Agency Vlogs");
    delete process.env.INSTALLATION_VIDEO_COLLECTION_AGENT_VLOGS;
  });
});
