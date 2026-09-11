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

  it("builds Team today plus scoped week/month totals and approved-photo fallbacks", async () => {
    mocks.compute.mockResolvedValue(new Map([
      ["daily", {
        from: "2026-09-09",
        to: "2026-09-09",
        rows: [
          { person_id: "person-1", full_name: "Sarah", submitted_ap_cents: 125000, sales_count: 2 },
          { person_id: "person-2", full_name: "Alex", submitted_ap_cents: 50000, sales_count: 1 },
        ],
      }],
      ["wtd", {
        from: "2026-09-07",
        to: "2026-09-09",
        rows: [
          { person_id: "person-1", full_name: "Sarah", submitted_ap_cents: 225000, sales_count: 3 },
          { person_id: "person-3", full_name: "Jordan", submitted_ap_cents: 75000, sales_count: 1 },
        ],
      }],
      ["mtd", {
        from: "2026-09-01",
        to: "2026-09-09",
        rows: [
          { person_id: "person-1", full_name: "Sarah", submitted_ap_cents: 325000, sales_count: 4 },
          { person_id: "person-2", full_name: "Alex", submitted_ap_cents: 50000, sales_count: 1 },
          { person_id: "person-3", full_name: "Jordan", submitted_ap_cents: 125000, sales_count: 2 },
        ],
      }],
    ]));

    const inPeople = vi.fn().mockResolvedValue({
      data: [
        { id: "person-1", photo_url: "https://img.test/sarah.jpg", photo_review_status: "approved" },
        { id: "person-2", photo_url: "https://img.test/alex.jpg", photo_review_status: "pending" },
      ],
      error: null,
    });
    const rangeClients = vi.fn().mockResolvedValue({
      data: [
        { id: "client-1", person_id: "person-1", annual_premium: 750, sale_status: "sale", submit_date: "2026-09-09", date: null, created_at: "2026-09-09T14:00:00Z" },
        { id: "client-2", person_id: "person-1", annual_premium: 500, sale_status: null, submit_date: "2026-09-09", date: null, created_at: "2026-09-09T15:00:00Z" },
        { id: "client-3", person_id: "person-2", annual_premium: 500, sale_status: "sale", submit_date: "2026-09-09", date: null, created_at: "2026-09-09T16:00:00Z" },
      ],
      error: null,
    });
    const orderClients = vi.fn().mockReturnValue({ range: rangeClients });
    const dateOr = vi.fn().mockReturnValue({ order: orderClients });
    const statusOr = vi.fn().mockReturnValue({ or: dateOr });
    const inClients = vi.fn().mockReturnValue({ or: statusOr });
    const from = vi.fn((table: string) => {
      if (table === "person") {
        return { select: vi.fn().mockReturnValue({ in: inPeople }) };
      }
      if (table === "clients") {
        return { select: vi.fn().mockReturnValue({ in: inClients }) };
      }
      throw new Error("Unexpected table " + table);
    });
    const admin = { from } as unknown as SupabaseClient;

    const snapshot = await buildLiveLeaderboardSnapshot(admin, {
      id: "cap-1",
      creator_person_id: "owner-1",
      scope: "team",
      created_at: "2026-09-09T00:00:00Z",
      revoked_at: null,
      rotated_from_id: null,
    });

    expect(mocks.compute).toHaveBeenCalledWith(admin, expect.objectContaining({
      scope: { kind: "team", ownerPersonId: "owner-1" },
      periods: ["daily", "wtd", "mtd"],
    }));
    expect(inPeople).toHaveBeenCalledWith("id", ["person-1", "person-2"]);
    expect(snapshot.totals).toEqual({
      submitted_ap_cents: 175000,
      deals: 3,
      people: 2,
      average_ticket_cents: 58333,
    });
    expect(snapshot.periods.week).toEqual({
      range: { from: "2026-09-07", to: "2026-09-09" },
      submitted_ap_cents: 300000,
      deals: 4,
    });
    expect(snapshot.periods.month).toEqual({
      range: { from: "2026-09-01", to: "2026-09-09" },
      submitted_ap_cents: 500000,
      deals: 7,
    });
    expect(snapshot.rows[0]).toEqual({
      full_name: "Sarah",
      photo_url: "https://img.test/sarah.jpg",
      submitted_ap_cents: 125000,
      sales_count: 2,
    });
    expect(snapshot.rows[1]?.photo_url).toBeNull();
    expect(snapshot.rows[0]).not.toHaveProperty("person_id");
    expect(snapshot.shop_day).toBe("2026-09-09");
    expect(snapshot.events).toHaveLength(3);
    expect(snapshot.events.map((event) => event.display_name)).toEqual(["Sarah", "Sarah", "Alex"]);
    expect(snapshot.events.map((event) => event.submitted_ap_cents)).toEqual([75000, 50000, 50000]);
    expect(snapshot.events.every((event) => /^lde_[A-Za-z0-9_-]{43}$/.test(event.id))).toBe(true);
    expect(snapshot.events.some((event) => event.id.includes("client-"))).toBe(false);
    expect(from).toHaveBeenCalledWith("clients");
  });

  it("builds an empty Organization day safely with zero average ticket", async () => {
    mocks.compute.mockResolvedValue(new Map([
      ["daily", { from: "2026-09-09", to: "2026-09-09", rows: [] }],
      ["wtd", { from: "2026-09-07", to: "2026-09-09", rows: [] }],
      ["mtd", { from: "2026-09-01", to: "2026-09-09", rows: [] }],
    ]));
    const admin = {} as SupabaseClient;
    const snapshot = await buildLiveLeaderboardSnapshot(admin, {
      id: "cap-org", creator_person_id: "creator-1", scope: "organization",
      created_at: "2026-09-09T00:00:00Z", revoked_at: null, rotated_from_id: null,
    });
    expect(mocks.compute).toHaveBeenCalledWith(admin, expect.objectContaining({
      scope: { kind: "organization" },
      periods: ["daily", "wtd", "mtd"],
    }));
    expect(snapshot.totals).toEqual({
      submitted_ap_cents: 0, deals: 0, people: 0, average_ticket_cents: 0,
    });
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.shop_day).toBe("2026-09-09");
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
