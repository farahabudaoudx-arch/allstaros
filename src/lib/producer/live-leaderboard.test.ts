import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ compute: vi.fn() }));
vi.mock("@/lib/producer/submitted-ap-leaderboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/producer/submitted-ap-leaderboard")>();
  return { ...actual, computeSubmittedApScopedLeaderboards: mocks.compute };
});

import {
  buildLiveLeaderboardSnapshot,
  createLiveLeaderboardToken,
  hashLiveLeaderboardToken,
  rotateLiveLeaderboardCapability,
} from "./live-leaderboard";

describe("Live Leaderboard core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates 256-bit base64url capability tokens and stores deterministic SHA-256 hashes", () => {
    const tokenA = createLiveLeaderboardToken();
    const tokenB = createLiveLeaderboardToken();
    expect(tokenA).toMatch(/^ll_[A-Za-z0-9_-]{43}$/);
    expect(tokenB).toMatch(/^ll_[A-Za-z0-9_-]{43}$/);
    expect(tokenA).not.toBe(tokenB);
    expect(hashLiveLeaderboardToken(tokenA)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashLiveLeaderboardToken(tokenA)).toBe(hashLiveLeaderboardToken(tokenA));
  });

  it("builds a Team snapshot from the current owner tree without exposing internal person ids", async () => {
    mocks.compute.mockResolvedValue(new Map([[
      "daily",
      {
        from: "2026-09-09",
        to: "2026-09-09",
        rows: [
          { person_id: "person-1", full_name: "Sarah", submitted_ap_cents: 125000, sales_count: 2 },
          { person_id: "person-2", full_name: "Alex", submitted_ap_cents: 50000, sales_count: 1 },
        ],
      },
    ]]));
    const snapshot = await buildLiveLeaderboardSnapshot({} as SupabaseClient, {
      id: "cap-1",
      creator_person_id: "owner-1",
      scope: "team",
      created_at: "2026-09-09T00:00:00Z",
      revoked_at: null,
      rotated_from_id: null,
    });
    expect(mocks.compute).toHaveBeenCalledWith({}, expect.objectContaining({
      scope: { kind: "team", ownerPersonId: "owner-1" },
      periods: ["daily"],
    }));
    expect(snapshot.totals).toEqual({ submitted_ap_cents: 175000, deals: 3, people: 2 });
    expect(snapshot.rows[0]).toEqual({ full_name: "Sarah", submitted_ap_cents: 125000, sales_count: 2 });
    expect(snapshot.rows[0]).not.toHaveProperty("person_id");
  });

  it("builds Organization scope without pinning an owner", async () => {
    mocks.compute.mockResolvedValue(new Map([[
      "daily",
      { from: "2026-09-09", to: "2026-09-09", rows: [] },
    ]]));
    await buildLiveLeaderboardSnapshot({} as SupabaseClient, {
      id: "cap-org", creator_person_id: "creator-1", scope: "organization",
      created_at: "2026-09-09T00:00:00Z", revoked_at: null, rotated_from_id: null,
    });
    expect(mocks.compute).toHaveBeenCalledWith({}, expect.objectContaining({
      scope: { kind: "organization" },
    }));
  });

  it("rotates through the atomic database RPC and returns only the new plaintext token", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: "cap-2", creator_person_id: "person-1", scope: "team", token_hash: "0".repeat(64),
        created_at: "2026-09-09T12:00:00Z", revoked_at: null, rotated_from_id: "cap-1",
      }],
      error: null,
    });
    const result = await rotateLiveLeaderboardCapability({ rpc } as unknown as SupabaseClient, "person-1", "cap-1");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("rotate_live_leaderboard_capability", {
      p_capability_id: "cap-1",
      p_creator_person_id: "person-1",
      p_new_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(result?.capability.id).toBe("cap-2");
    expect(result?.token).toMatch(/^ll_[A-Za-z0-9_-]{43}$/);
  });
});
