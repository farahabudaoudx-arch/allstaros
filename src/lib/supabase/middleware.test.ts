import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mocks.getUser },
  })),
}));

import { updateSession } from "./middleware";

describe("Supabase middleware Gateway runner routes", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: null } });
  });

  it.each([
    "/api/gateway/connect/callback",
    "/api/gateway/connect/fail",
  ])("allows unauthenticated server-to-server Gateway route %s", async (pathname) => {
    const response = await updateSession(new NextRequest(`https://app.example.test${pathname}`, {
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps the member-initiated connect start route auth-gated", async () => {
    const response = await updateSession(new NextRequest("https://app.example.test/api/gateway/connect/start", {
      method: "POST",
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/signin");
  });
});
