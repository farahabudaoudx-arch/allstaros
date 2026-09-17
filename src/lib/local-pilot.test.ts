import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isWhitelabelLocalPilot } from "@/lib/local-pilot";

describe("Whitelabel local pilot safety gate", () => {
  beforeEach(() => {
    vi.stubEnv("WHITELABEL_LOCAL_PILOT", "1");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("WHITELABEL_LOCAL_PILOT_ALLOW_NEXT_START", "0");
    vi.stubEnv("WHITELABEL_LOCAL_PILOT_REGISTRY", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
});
