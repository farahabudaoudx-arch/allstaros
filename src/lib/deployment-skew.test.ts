import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLiveDeploymentId, isDeploymentStale, pageDeploymentId } from "./deployment-skew";

function stubDocument(initialAttrs: Record<string, string> = {}) {
  const attrs = new Map(Object.entries(initialAttrs));
  vi.stubGlobal("document", {
    documentElement: {
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => {
        attrs.set(name, value);
      },
      removeAttribute: (name: string) => {
        attrs.delete(name);
      },
    },
  });
}

describe("deployment-skew", () => {
  beforeEach(() => {
    stubDocument();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for local/dev deployment ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ sha: "dev" }),
      })),
    );
    expect(await fetchLiveDeploymentId()).toBeNull();
    expect(pageDeploymentId()).toBeNull();

    document.documentElement.setAttribute("data-dpl-id", "local-dev");
    expect(pageDeploymentId()).toBeNull();
  });

  it("detects when the page deployment id differs from the live server", async () => {
    document.documentElement.setAttribute("data-dpl-id", "deploy-a");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ sha: "deploy-b" }),
      })),
    );

    expect(await isDeploymentStale()).toBe(true);
  });

  it("returns false when ids match", async () => {
    document.documentElement.setAttribute("data-dpl-id", "deploy-a");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ sha: "deploy-a" }),
      })),
    );

    expect(await isDeploymentStale()).toBe(false);
  });
});
