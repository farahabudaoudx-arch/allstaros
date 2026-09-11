import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRange } from "@/lib/producer/metrics";
import {
  computeSubmittedApScopedLeaderboards,
  DISCORD_LEADERBOARD_TZ,
} from "./submitted-ap-leaderboard";

type PersonFixture = {
  id: string;
  full_name: string;
  upline_id: string | null;
  status: string | null;
};

type ClientFixture = {
  person_id: string;
  annual_premium: number;
  sale_status: string | null;
  submit_date: string;
  date: string | null;
  created_at: string;
};

function fakeAdmin(persons: PersonFixture[], clients: ClientFixture[]): SupabaseClient {
  return {
    from(table: string) {
      if (table === "person") {
        return {
          select() {
            return {
              order() {
                return {
                  async range(from: number, to: number) {
                    return { data: persons.slice(from, to + 1), error: null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "clients") {
        return {
          select() {
            return {
              in(_column: string, ids: string[]) {
                const matching = clients.filter((row) => ids.includes(row.person_id));
                const query = {
                  eq() {
                    return query;
                  },
                  or() {
                    return query;
                  },
                  order() {
                    return query;
                  },
                  async range(from: number, to: number) {
                    return { data: matching.slice(from, to + 1), error: null };
                  },
                };
                return query;
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

function sale(personId: string, amount: number, day: string): ClientFixture {
  return {
    person_id: personId,
    annual_premium: amount,
    sale_status: "sale",
    submit_date: day,
    date: null,
    created_at: `${day}T15:00:00.000Z`,
  };
}

describe("submitted AP scoped leaderboard", () => {
  const today = resolveRange("today", DISCORD_LEADERBOARD_TZ).from;

  it("keeps a no-downline Team board scoped to its active owner", async () => {
    const admin = fakeAdmin(
      [
        { id: "owner", full_name: "Sarah", upline_id: null, status: "active" },
        { id: "outsider", full_name: "Outside Producer", upline_id: null, status: "active" },
      ],
      [sale("owner", 750, today), sale("outsider", 9000, today)],
    );

    const result = await computeSubmittedApScopedLeaderboards(admin, {
      scope: { kind: "team", ownerPersonId: "owner" },
      periods: ["daily"],
    });

    expect(result.get("daily")?.rows).toEqual([
      {
        person_id: "owner",
        full_name: "Sarah",
        submitted_ap_cents: 75000,
        sales_count: 1,
      },
    ]);
  });

  it("excludes inactive and explicitly excluded people from Organization Live", async () => {
    const excludedId = "11d8e4ac-747c-47ea-8fb8-84c3d6f07360";
    const admin = fakeAdmin(
      [
        { id: "active", full_name: "Active Producer", upline_id: null, status: "active" },
        { id: "inactive", full_name: "Inactive Producer", upline_id: null, status: "inactive" },
        { id: excludedId, full_name: "Excluded Producer", upline_id: null, status: "active" },
      ],
      [
        sale("active", 1000, today),
        sale("inactive", 8000, today),
        sale(excludedId, 9000, today),
      ],
    );

    const result = await computeSubmittedApScopedLeaderboards(admin, {
      scope: { kind: "organization" },
      periods: ["daily"],
    });

    expect(result.get("daily")?.rows.map((row) => row.person_id)).toEqual(["active"]);
  });

  it("keeps one row per person and applies dollars, deal-count, then name tie-breaks", async () => {
    const admin = fakeAdmin(
      [
        { id: "alice", full_name: "Alice", upline_id: null, status: "active" },
        { id: "bob", full_name: "Bob", upline_id: null, status: "active" },
        { id: "charlie", full_name: "Charlie", upline_id: null, status: "active" },
      ],
      [
        sale("alice", 1000, today),
        sale("bob", 500, today),
        sale("bob", 500, today),
        sale("charlie", 1000, today),
      ],
    );

    const result = await computeSubmittedApScopedLeaderboards(admin, {
      scope: { kind: "organization" },
      periods: ["daily"],
    });

    expect(result.get("daily")?.rows.map((row) => [row.full_name, row.sales_count])).toEqual([
      ["Bob", 2],
      ["Alice", 1],
      ["Charlie", 1],
    ]);
  });
});
