import { describe, it, expect, vi, beforeEach } from "vitest";

// inviteTeamBatch invites a list of people in one call. Each row carries a name,
// email, and whether they already have a license (producer, skips the pipeline)
// or not (recruit). It sends the good ones and reports the rest with a reason;
// one bad row never aborts the others.

let caller: { id: string; is_builder: boolean } | null;
let existingEmails: Set<string>;
let inserted: Array<Record<string, unknown>>;

vi.mock("@/lib/auth", () => ({
  getCurrentPerson: async () => caller,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/site-url", () => ({ getAppUrl: () => "https://app.test" }));
vi.mock("@/lib/emails/welcome", () => ({
  welcomeEmail: () => ({ subject: "s", html: "h", text: "t" }),
}));
vi.mock("@/lib/email", () => ({ sendEmail: async () => ({ ok: true }) }));

function fakeAdmin() {
  let n = 0;
  return {
    from(table: string) {
      if (table === "person") {
        return {
          select: () => ({
            ilike: (_col: string, val: string) => ({
              maybeSingle: async () => ({
                data: existingEmails.has(val.toLowerCase()) ? { id: "existing" } : null,
                error: null,
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const id = `person-${++n}`;
                inserted.push({ id, ...row });
                return { data: { id }, error: null };
              },
            }),
          }),
          delete: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "recruit") {
        return {
          insert: async () => ({ error: null }),
          delete: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        generateLink: async () => ({
          data: { properties: { hashed_token: "tok" }, user: { id: "u" } },
          error: null,
        }),
        deleteUser: async () => ({}),
      },
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => fakeAdmin(),
}));

import { inviteTeamBatch } from "./recruits";

beforeEach(() => {
  caller = { id: "builder-1", is_builder: true };
  existingEmails = new Set();
  inserted = [];
});

describe("inviteTeamBatch", () => {
  it("invites every valid row and returns one result per row, in order", async () => {
    const res = await inviteTeamBatch([
      { name: "Bob Smith", email: "bob@x.com", role: "recruit" },
      { name: "Jane Doe", email: "jane@y.com", role: "producer" },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.results).toHaveLength(2);
    expect(res.results.map((r) => r.email)).toEqual(["bob@x.com", "jane@y.com"]);
    expect(res.results.every((r) => r.ok)).toBe(true);
  });

  it("stores the provided name, and sets flags to match each role", async () => {
    await inviteTeamBatch([
      { name: "Bob Smith", email: "bob@x.com", role: "recruit" },
      { name: "Jane Doe", email: "jane@y.com", role: "producer" },
      { name: "Cal Team", email: "cal@z.com", role: "builder" },
    ]);
    const bob = inserted.find((r) => r.email === "bob@x.com");
    const jane = inserted.find((r) => r.email === "jane@y.com");
    const cal = inserted.find((r) => r.email === "cal@z.com");
    expect(bob?.full_name).toBe("Bob Smith");
    expect(bob?.is_producer).toBe(false); // recruit
    expect(bob?.is_builder).toBe(false);
    expect(jane?.is_producer).toBe(true); // licensed producer
    expect(jane?.is_builder).toBe(false);
    expect(cal?.is_producer).toBe(true); // builder is licensed
    expect(cal?.is_builder).toBe(true); // ...and runs their own team
  });

  it("falls back to the email prefix when no name is given", async () => {
    await inviteTeamBatch([{ name: "", email: "solo@x.com", role: "recruit" }]);
    expect(inserted[0]?.full_name).toBe("solo");
  });

  it("reports an already-existing email without aborting the rest", async () => {
    existingEmails = new Set(["taken@x.com"]);
    const res = await inviteTeamBatch([
      { name: "Taken", email: "taken@x.com", role: "recruit" },
      { name: "Fresh", email: "fresh@x.com", role: "recruit" },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.results[0].ok).toBe(false);
    expect(res.results[0].error).toMatch(/already been invited/i);
    expect(res.results[1].ok).toBe(true);
    expect(inserted).toHaveLength(1); // only the fresh one created
  });

  it("collapses a duplicate email in the same list to one invite", async () => {
    const res = await inviteTeamBatch([
      { name: "First", email: "dup@x.com", role: "recruit" },
      { name: "Second", email: "DUP@x.com", role: "recruit" },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.results[0].ok).toBe(true);
    expect(res.results[1].ok).toBe(false);
    expect(res.results[1].error).toMatch(/duplicate/i);
    expect(inserted).toHaveLength(1);
  });

  it("blocks a batch over 50 and lets exactly 50 through", async () => {
    const row = (i: number) => ({
      name: `P${i}`,
      email: `p${i}@x.com`,
      role: "recruit" as const,
    });
    const fifty = Array.from({ length: 50 }, (_, i) => row(i));
    const fiftyOne = Array.from({ length: 51 }, (_, i) => row(i));

    const okRes = await inviteTeamBatch(fifty);
    expect(okRes.ok).toBe(true);

    const blocked = await inviteTeamBatch(fiftyOne);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toMatch(/50/);
  });

  it("refuses the whole batch when the caller is not a builder", async () => {
    caller = { id: "producer-1", is_builder: false };
    const res = await inviteTeamBatch([
      { name: "Bob", email: "bob@x.com", role: "recruit" },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/builders only/i);
    expect(inserted).toHaveLength(0);
  });

  it("rejects an empty list", async () => {
    const res = await inviteTeamBatch([]);
    expect(res.ok).toBe(false);
  });
});
