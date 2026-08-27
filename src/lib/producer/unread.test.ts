import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getProducerUnread } from "./unread";

const createClientMock = vi.mocked(createClient);

afterEach(() => {
  vi.clearAllMocks();
});

function mockRpc(result: {
  data: unknown;
  error: { message: string } | null;
}) {
  createClientMock.mockResolvedValue({
    rpc: vi.fn().mockResolvedValue(result),
  } as never);
}

describe("getProducerUnread", () => {
  it("maps RPC flags from a single-row array", async () => {
    mockRpc({
      data: [{ upline: true, team: false }],
      error: null,
    });
    await expect(getProducerUnread("any")).resolves.toEqual({
      upline: true,
      team: false,
    });
  });

  it("maps RPC flags from a bare object row", async () => {
    mockRpc({
      data: { upline: false, team: true },
      error: null,
    });
    await expect(getProducerUnread("any")).resolves.toEqual({
      upline: false,
      team: true,
    });
  });

  it("treats null flags as false", async () => {
    mockRpc({
      data: [{ upline: null, team: null }],
      error: null,
    });
    await expect(getProducerUnread("any")).resolves.toEqual({
      upline: false,
      team: false,
    });
  });

  it("throws ProducerQueryError on RPC failure (does not silent all-read)", async () => {
    mockRpc({
      data: null,
      error: { message: "canceling statement due to statement timeout" },
    });
    await expect(getProducerUnread("any")).rejects.toMatchObject({
      message: "canceling statement due to statement timeout",
      queryPhase: "unread",
    });
  });

  it("throws when the RPC returns no row", async () => {
    mockRpc({ data: [], error: null });
    await expect(getProducerUnread("any")).rejects.toMatchObject({
      queryPhase: "unread",
    });
  });
});
