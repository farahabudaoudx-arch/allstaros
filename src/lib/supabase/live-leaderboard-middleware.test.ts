import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: mocks.getUser } })),
}));
import { updateSession } from "./middleware";

describe("Supabase middleware Live Leaderboard boundaries", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: null } });
  });

  it.each(["/live/leaderboard", "/api/live-leaderboard/snapshot"])("allows unauthenticated Live surface %s", async (pathname) => {
    const response = await updateSession(new NextRequest("https://app.example.test" + pathname));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps capability management auth-gated", async () => {
    const response = await updateSession(new NextRequest("https://app.example.test/api/producer/live-leaderboard/capabilities", { method: "POST" }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/signin");
  });
});
