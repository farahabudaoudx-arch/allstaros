import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ createServiceRoleClient: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: mocks.createServiceRoleClient }));

import { GET } from "./route";

describe("compute-stalls cron authorization", () => {
  const original = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: 3, error: null });
    mocks.createServiceRoleClient.mockReturnValue({ rpc: mocks.rpc });
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("makes no business call when CRON_SECRET is absent", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new NextRequest("http://localhost/api/cron/compute-stalls"));
    expect(response.status).toBe(503);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("runs only with the exact bearer token", async () => {
    process.env.CRON_SECRET = "expected";
    const response = await GET(new NextRequest("http://localhost/api/cron/compute-stalls", {
      headers: { authorization: "Bearer expected" },
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("compute_stalls");
  });
});
