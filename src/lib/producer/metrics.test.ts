import { describe, expect, it } from "vitest";
import { computeLeaderboard } from "./metrics";

const OTHER_ID = "11111111-1111-4111-8111-111111111111";
const LEVI_ID = "776f2cb4-8531-417d-9729-38a9630649ba";

function fakeSupabase(rpcRows: Record<string, unknown>[]) {
  return {
    from() {
      throw new Error("computeLeaderboard should use leaderboard_aggregates RPC, not table scans");
    },
    rpc(name: string, args: { p_from: string; p_to: string; p_tz: string }) {
      expect(name).toBe("leaderboard_aggregates");
      expect(args.p_from).toBeTruthy();
      expect(args.p_to).toBeTruthy();
      expect(args.p_tz).toBeTruthy();
      return Promise.resolve({ data: rpcRows, error: null });
    },
  };
}

describe("computeLeaderboard", () => {
  it("maps leaderboard_aggregates RPC rows and ranks by metric", async () => {
    const board = await computeLeaderboard(
      fakeSupabase([
        {
          person_id: OTHER_ID,
          full_name: "Other Producer",
          ap_cents: 10000,
          ip_cents: 0,
          sale_count: 1,
          policies: 0,
          deposits_cents: 0,
          tracker_sales: 1,
          dials: 10,
          contacts: 5,
          appointments: 2,
          presentations: 1,
        },
        {
          person_id: LEVI_ID,
          full_name: "Levi McCarrol",
          ap_cents: 500000,
          ip_cents: 0,
          sale_count: 1,
          policies: 0,
          deposits_cents: 0,
          tracker_sales: 1,
          dials: 3,
          contacts: 2,
          appointments: 1,
          presentations: 1,
        },
      ]) as never,
      {
        rangeKey: "custom",
        tz: "America/Chicago",
        from: "2026-07-10",
        to: "2026-07-10",
        metric: "ap_cents",
      },
    );

    expect(board.rows[0]).toMatchObject({
      person_id: LEVI_ID,
      sales: 1,
      tracker_sales: 1,
      ap_cents: 500000,
      appointments: 1,
    });
    expect(board.rows[1].person_id).toBe(OTHER_ID);
  });

  it("uses max(tracker_sales, sale_count) for the sales metric", async () => {
    const board = await computeLeaderboard(
      fakeSupabase([
        {
          person_id: LEVI_ID,
          full_name: "Levi McCarrol",
          ap_cents: 0,
          ip_cents: 0,
          sale_count: 2,
          policies: 0,
          deposits_cents: 0,
          tracker_sales: 5,
          dials: 0,
          contacts: 0,
          appointments: 0,
          presentations: 0,
        },
      ]) as never,
      {
        rangeKey: "custom",
        tz: "UTC",
        from: "2026-07-10",
        to: "2026-07-10",
        metric: "sales",
      },
    );

    expect(board.rows[0].sales).toBe(5);
    expect(board.rows[0].tracker_sales).toBe(5);
  });

  it("surfaces RPC errors as ProducerQueryError phase leaderboard_aggregates", async () => {
    const supabase = {
      from() {
        throw new Error("unused");
      },
      rpc() {
        return Promise.resolve({
          data: null,
          error: { message: "canceling statement due to statement timeout" },
        });
      },
    };

    await expect(
      computeLeaderboard(supabase as never, {
        rangeKey: "mtd",
        tz: "UTC",
        metric: "ap_cents",
      }),
    ).rejects.toMatchObject({
      message: "canceling statement due to statement timeout",
      queryPhase: "leaderboard_aggregates",
    });
  });
});
