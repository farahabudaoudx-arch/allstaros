import { describe, expect, it } from "vitest";
import { computeLeaderboard } from "./metrics";

const OTHER_ID = "11111111-1111-4111-8111-111111111111";
const LEVI_ID = "776f2cb4-8531-417d-9729-38a9630649ba";

type ClientFixture = {
  id: string;
  person_id: string;
  annual_premium: number;
  sale_status: string;
  submit_date: string | null;
  date: string | null;
  created_at: string | null;
  issue_date: string | null;
  state: string | null;
  age: number | null;
  quotes: null;
  chosen_quote_index: null;
};

function soldClient(id: string, personId: string, annualPremium: number): ClientFixture {
  return {
    id,
    person_id: personId,
    annual_premium: annualPremium,
    sale_status: "sale",
    submit_date: "2026-07-10",
    date: "2026-07-10",
    created_at: "2026-07-10T12:00:00Z",
    issue_date: null,
    state: null,
    age: null,
    quotes: null,
    chosen_quote_index: null,
  };
}

class FakeQuery {
  private gteFilter: { column: string; value: string } | null = null;
  private lteFilter: { column: string; value: string } | null = null;
  private inFilter: { column: string; values: string[] } | null = null;
  private ordered = false;

  constructor(
    private readonly table: string,
    private readonly rows: Record<string, unknown>[],
  ) {}

  select() {
    return this;
  }

  gte(column: string, value: string) {
    this.gteFilter = { column, value };
    return this;
  }

  lte(column: string, value: string) {
    this.lteFilter = { column, value };
    return this;
  }

  order(column: string) {
    expect(column, `${this.table} must use stable pagination order`).toBe("id");
    this.ordered = true;
    return this;
  }

  in(column: string, values: string[]) {
    this.inFilter = { column, values };
    return Promise.resolve({ data: this.applyFilters(), error: null });
  }

  range(from: number, to: number) {
    expect(this.ordered, `${this.table} must order before range`).toBe(true);
    return Promise.resolve({ data: this.applyFilters().slice(from, to + 1), error: null });
  }

  private applyFilters() {
    return this.rows.filter((row) => {
      if (this.gteFilter && String(row[this.gteFilter.column] ?? "") < this.gteFilter.value) return false;
      if (this.lteFilter && String(row[this.lteFilter.column] ?? "") > this.lteFilter.value) return false;
      if (this.inFilter && !this.inFilter.values.includes(String(row[this.inFilter.column] ?? ""))) return false;
      return true;
    });
  }
}

function fakeSupabase(fixtures: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      return new FakeQuery(table, fixtures[table] ?? []);
    },
  };
}

describe("computeLeaderboard", () => {
  it("includes client sales beyond Supabase's first 1000-row page", async () => {
    const firstPageClients = Array.from({ length: 1000 }, (_, i) =>
      soldClient(`10000000-0000-4000-8000-${String(i).padStart(12, "0")}`, OTHER_ID, 1),
    );
    const secondPageSale = soldClient("ffffffff-ffff-4fff-8fff-ffffffffffff", LEVI_ID, 5000);

    const board = await computeLeaderboard(fakeSupabase({
      clients: [...firstPageClients, secondPageSale],
      tracker_entry: [],
      client_deposits: [],
      person: [
        { id: OTHER_ID, full_name: "Other Producer" },
        { id: LEVI_ID, full_name: "Levi McCarrol" },
      ],
    }) as never, {
      rangeKey: "custom",
      tz: "America/Chicago",
      from: "2026-07-10",
      to: "2026-07-10",
      metric: "ap_cents",
    });

    expect(board.rows[0]).toMatchObject({
      person_id: LEVI_ID,
      sales: 1,
      ap_cents: 500000,
    });
  });
});
