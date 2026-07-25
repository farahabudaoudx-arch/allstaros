import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression for the 7/9 "can't message my downline" reports. The 7/3 server
// action migration (e9cb16e) gated sends on recruit.builder_id, the
// original-inviter stamp. That stamp goes stale when a team is rewired
// (rebuild-stuck-invites updated person.upline_id but never builder_id), so
// real direct uplines were refused. The rule now: the recruit and their
// CURRENT direct upline (person.upline_id, the live org chart) may post;
// nobody else, including the stale stamp holder and higher uplines.
//
// The fake client mirrors RLS reads: everyone in the recruit's upline chain
// can read the recruit row (recruit_select uses can_view); an outsider gets
// no row back, exactly like RLS filtering.

const RECRUIT_PERSON = "person-recruit";
const CURRENT_UPLINE = "person-current-upline"; // person.upline_id, post-rewire
const OLD_INVITER = "person-old-inviter"; // recruit.builder_id, stale stamp
const GRANDPARENT = "person-grandparent"; // higher in the chain
const OUTSIDER = "person-outsider";

let currentPersonId: string;

vi.mock("@/lib/auth", () => ({
  getCurrentPerson: async () => ({ id: currentPersonId }),
}));

vi.mock("@/lib/ai/assistant", () => ({
  askAssistant: async () => ({ ok: false, error: "unused" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

function fakeClient() {
  const canView = [RECRUIT_PERSON, CURRENT_UPLINE, OLD_INVITER, GRANDPARENT];
  return {
    from(table: string) {
      if (table === "recruit") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: canView.includes(currentPersonId)
                  ? {
                      person_id: RECRUIT_PERSON,
                      builder_id: OLD_INVITER,
                      person: { upline_id: CURRENT_UPLINE },
                    }
                  : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "message") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => ({
                data: {
                  id: "msg-1",
                  ...row,
                  created_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeClient(),
  createServiceRoleClient: () => ({}),
}));

import { sendMessage } from "./messages";

describe("sendMessage — who may post in a recruit thread (direct upline only)", () => {
  beforeEach(() => {
    currentPersonId = "";
  });

  it("the recruit themselves can post", async () => {
    currentPersonId = RECRUIT_PERSON;
    const result = await sendMessage("recruit-1", "hi upline");
    expect(result.ok).toBe(true);
  });

  it("the CURRENT direct upline can post even when the builder_id stamp is stale", async () => {
    currentPersonId = CURRENT_UPLINE;
    const result = await sendMessage("recruit-1", "welcome to my team");
    expect(result.ok).toBe(true);
  });

  it("the stale stamp holder (old inviter, no longer the upline) cannot post", async () => {
    currentPersonId = OLD_INVITER;
    const result = await sendMessage("recruit-1", "should be refused");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/direct upline/i);
  });

  it("an upline above the direct upline cannot post, and the reason says why", async () => {
    currentPersonId = GRANDPARENT;
    const result = await sendMessage("recruit-1", "checking in from the top");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/direct upline/i);
  });

  it("someone outside the recruit's tree cannot post", async () => {
    currentPersonId = OUTSIDER;
    const result = await sendMessage("recruit-1", "should never land");
    expect(result.ok).toBe(false);
  });
});
