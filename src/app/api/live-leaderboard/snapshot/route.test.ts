import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  resolveCapability: vi.fn(),
  buildSnapshot: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: mocks.createServiceRoleClient }));
vi.mock("@/lib/producer/live-leaderboard", () => ({
  resolveLiveLeaderboardCapability: mocks.resolveCapability,
  buildLiveLeaderboardSnapshot: mocks.buildSnapshot,
}));

import { GET } from "./route";

describe("public Live Leaderboard snapshot API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServiceRoleClient.mockReturnValue({ name: "admin" });
  });

  it("requires a bearer capability rather than an app session", async () => {
    const response = await GET(new Request("https://app.example.test/api/live-leaderboard/snapshot"));
    expect(response.status).toBe(401);
    expect(mocks.resolveCapability).not.toHaveBeenCalled();
  });

  it("returns the dead-link state after revocation", async () => {
    mocks.resolveCapability.mockResolvedValue({ status: "revoked" });
    const response = await GET(new Request("https://app.example.test/api/live-leaderboard/snapshot", { headers: { Authorization: "Bearer ll_x" } }));
    const body = await response.json();
    expect(response.status).toBe(410);
    expect(body.message).toBe("Ask for a new link.");
  });

  it("serves only the scoped snapshot for an active capability", async () => {
    const capability = { id: "cap-1", creator_person_id: "person-1", scope: "team", created_at: "2026-09-09T00:00:00Z", revoked_at: null, rotated_from_id: null };
    mocks.resolveCapability.mockResolvedValue({ status: "active", capability });
    mocks.buildSnapshot.mockResolvedValue({
      scope: "team",
      asOf: "2026-09-09T12:00:00Z",
      range: { from: "2026-09-09", to: "2026-09-09" },
      totals: { submitted_ap_cents: 125000, deals: 2, people: 1 },
      rows: [{ full_name: "Sarah", submitted_ap_cents: 125000, sales_count: 2 }],
    });
    const response = await GET(new Request("https://app.example.test/api/live-leaderboard/snapshot", { headers: { Authorization: "Bearer ll_x" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.scope).toBe("team");
    expect(body.rows).toHaveLength(1);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Authorization");
    expect(mocks.buildSnapshot).toHaveBeenCalledWith({ name: "admin" }, capability);
  });
});
