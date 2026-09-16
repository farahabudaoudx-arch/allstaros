import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isWhitelabelLocalPilot } from "@/lib/local-pilot";

describe("Whitelabel local pilot safety gate", () => {
  beforeEach(() => {
    vi.stubEnv("WHITELABEL_LOCAL_PILOT", "1");
    vi.stubEnv("NODE_ENV", "development");
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
});
