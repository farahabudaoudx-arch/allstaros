import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isWhitelabelLocalPilot, localPilotProject } from "@/lib/local-pilot";

describe("Whitelabel local pilot safety gate", () => {
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "whitelabel-local-pilot-"));
    vi.stubEnv("WHITELABEL_LOCAL_PILOT", "1");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("WHITELABEL_LOCAL_PILOT_ALLOW_NEXT_START", "0");
    vi.stubEnv("WHITELABEL_LOCAL_PILOT_REGISTRY", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("enables only when explicitly requested", () => {
    expect(isWhitelabelLocalPilot()).toBe(true);
    vi.stubEnv("WHITELABEL_LOCAL_PILOT", "0");
    expect(isWhitelabelLocalPilot()).toBe(false);
  });

  it("refuses to run under production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => isWhitelabelLocalPilot()).toThrow(/forbidden in production/i);
  });

  it("allows an explicitly gated production-mode next start only on loopback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WHITELABEL_LOCAL_PILOT_ALLOW_NEXT_START", "1");
    vi.stubEnv("WHITELABEL_LOCAL_PILOT_REGISTRY", "E:\\LocalPilot\\whitelabel-pilot\\registry.json");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3201");
    expect(isWhitelabelLocalPilot()).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
    expect(() => isWhitelabelLocalPilot()).toThrow(/forbidden in production/i);
  });

  it("requires an explicit local project role", async () => {
    const registryPath = path.join(tempRoot, "registry.json");
    writeFileSync(registryPath, JSON.stringify({
      projects: [{
        projectRef: "local-customer-a",
        accountRef: "local",
        apiUrl: "http://127.0.0.1:54321",
        dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        publishableKey: "local",
        secretKey: "local",
      }],
    }));
    vi.stubEnv("WHITELABEL_LOCAL_PILOT_REGISTRY", registryPath);
    await expect(localPilotProject("local-customer-a")).rejects.toThrow(/missing a valid explicit role/i);
  });

  it("rejects a registry that points local-only work at remote Supabase endpoints", async () => {
    const registryPath = path.join(tempRoot, "registry.json");
    writeFileSync(registryPath, JSON.stringify({
      projects: [{
        projectRef: "local-customer-a",
        accountRef: "local",
        role: "customer-local",
        apiUrl: "https://example.supabase.co",
        dbUrl: "postgresql://postgres:postgres@example.supabase.co:5432/postgres",
        publishableKey: "local",
        secretKey: "local",
      }],
    }));
    vi.stubEnv("WHITELABEL_LOCAL_PILOT_REGISTRY", registryPath);
    await expect(localPilotProject("local-customer-a")).rejects.toThrow(/non-loopback apiUrl/i);
  });
});
