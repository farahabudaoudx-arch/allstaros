import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentPerson: vi.fn(),
  canAccessProducerApp: vi.fn(),
  createServiceRoleClient: vi.fn(),
  listCapabilities: vi.fn(),
  mintCapability: vi.fn(),
  revokeCapability: vi.fn(),
  rotateCapability: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentPerson: mocks.getCurrentPerson,
  canAccessProducerApp: mocks.canAccessProducerApp,
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: mocks.createServiceRoleClient }));
vi.mock("@/lib/producer/live-leaderboard", () => ({
  listLiveLeaderboardCapabilities: mocks.listCapabilities,
  mintLiveLeaderboardCapability: mocks.mintCapability,
  revokeLiveLeaderboardCapability: mocks.revokeCapability,
  rotateLiveLeaderboardCapability: mocks.rotateCapability,
}));

import { GET, POST } from "./route";

describe("Live Leaderboard capability API", () => {
  const admin = { name: "admin" };
  const person = { id: "person-1", is_producer: true };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentPerson.mockResolvedValue(person);
    mocks.canAccessProducerApp.mockReturnValue(true);
    mocks.createServiceRoleClient.mockReturnValue(admin);
  });

  it("rejects people without Leaderboard access", async () => {
    mocks.canAccessProducerApp.mockReturnValue(false);
    const response = await POST(new Request("https://app.example.test/api/producer/live-leaderboard/capabilities", {
      method: "POST",
      body: JSON.stringify({ action: "mint", scope: "team" }),
    }));
    expect(response.status).toBe(403);
    expect(mocks.mintCapability).not.toHaveBeenCalled();
  });

  it("mints an unguessable-link surface with scope fixed by the request", async () => {
    mocks.mintCapability.mockResolvedValue({
      capability: { id: "cap-1", creator_person_id: "person-1", scope: "team", created_at: "2026-09-09T00:00:00Z", revoked_at: null, rotated_from_id: null },
      token: "ll_secret",
    });
    const response = await POST(new Request("https://app.example.test/api/producer/live-leaderboard/capabilities", {
      method: "POST",
      body: JSON.stringify({ action: "mint", scope: "team" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(mocks.mintCapability).toHaveBeenCalledWith(admin, "person-1", "team");
    expect(body.url).toBe("https://app.example.test/live/leaderboard#ll_secret");
  });

  it("does not let an unrelated creator revoke a capability", async () => {
    mocks.revokeCapability.mockResolvedValue(false);
    const response = await POST(new Request("https://app.example.test/api/producer/live-leaderboard/capabilities", {
      method: "POST",
      body: JSON.stringify({ action: "revoke", capabilityId: "someone-elses-cap" }),
    }));
    expect(response.status).toBe(404);
    expect(mocks.revokeCapability).toHaveBeenCalledWith(admin, "person-1", "someone-elses-cap");
  });

  it("rotates one owned link and returns the replacement URL", async () => {
    mocks.rotateCapability.mockResolvedValue({
      capability: { id: "cap-2", creator_person_id: "person-1", scope: "organization", created_at: "2026-09-09T00:00:00Z", revoked_at: null, rotated_from_id: "cap-1" },
      token: "ll_replacement",
    });
    const response = await POST(new Request("https://app.example.test/api/producer/live-leaderboard/capabilities", {
      method: "POST",
      body: JSON.stringify({ action: "rotate", capabilityId: "cap-1" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.url).toBe("https://app.example.test/live/leaderboard#ll_replacement");
  });

  it("lists only the current creator capabilities", async () => {
    mocks.listCapabilities.mockResolvedValue([{ id: "cap-1", creator_person_id: "person-1", scope: "team", created_at: "2026-09-09T00:00:00Z", revoked_at: null, rotated_from_id: null }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.listCapabilities).toHaveBeenCalledWith(admin, "person-1");
  });
});
