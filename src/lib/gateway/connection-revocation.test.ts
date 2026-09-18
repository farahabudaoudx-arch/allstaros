import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import {
  completeGatewayConnectRequest,
  disconnectGatewayForPerson,
  revokeGatewayRunnerSession,
} from "./connection";

function query(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => result),
      })),
    })),
  };
}

describe("Gateway runner-local session revocation", () => {
  const originalHosted = process.env.GATEWAY_HOSTED_CONNECT_URL;
  const originalToken = process.env.GATEWAY_AGENT_CONNECT_TOKEN;

  beforeEach(() => {
    mocks.from.mockReset();
    mocks.rpc.mockReset();
    process.env.GATEWAY_HOSTED_CONNECT_URL = "https://gateway-runner.example.test/connect";
    process.env.GATEWAY_AGENT_CONNECT_TOKEN = "connect-token";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalHosted === undefined) delete process.env.GATEWAY_HOSTED_CONNECT_URL;
    else process.env.GATEWAY_HOSTED_CONNECT_URL = originalHosted;
    if (originalToken === undefined) delete process.env.GATEWAY_AGENT_CONNECT_TOKEN;
    else process.env.GATEWAY_AGENT_CONNECT_TOKEN = originalToken;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the hosted runner origin and connect token without putting the session ref in the URL", async () => {
    await expect(revokeGatewayRunnerSession("gw_old-session-ref")).resolves.toBe(true);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gateway-runner.example.test/control/session/revoke");
    expect(String(url)).not.toContain("gw_old-session-ref");
    expect(init?.headers).toMatchObject({ authorization: "Bearer connect-token" });
    expect(JSON.parse(String(init?.body))).toEqual({ sessionRef: "gw_old-session-ref" });
    expect(init?.cache).toBe("no-store");
  });

  it("completes reconnect fencing before best-effort revoking the previous session", async () => {
    const events: string[] = [];
    mocks.from.mockImplementation((table: string) => table === "gateway_connect_request"
      ? query({ data: { person_id: "person-1", status: "pending", expires_at: "2099-01-01T00:00:00.000Z" }, error: null })
      : query({ data: { session_ref: "gw_previous-ref" }, error: null }));
    mocks.rpc.mockImplementation(async () => {
      events.push("db-complete");
      return { data: "person-1", error: null };
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      events.push("runner-revoke");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    await expect(completeGatewayConnectRequest("state-1", "gw_new-ref")).resolves.toBe("person-1");
    expect(events).toEqual(["db-complete", "runner-revoke"]);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body).toEqual({ sessionRef: "gw_previous-ref" });
  });

  it("fences disconnect in the database before revoking the old runner session", async () => {
    const events: string[] = [];
    mocks.from.mockReturnValue(query({ data: { session_ref: "gw_previous-ref" }, error: null }));
    mocks.rpc.mockImplementation(async () => {
      events.push("db-disconnect");
      return { data: null, error: null };
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      events.push("runner-revoke");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    await expect(disconnectGatewayForPerson("person-1")).resolves.toBeUndefined();
    expect(events).toEqual(["db-disconnect", "runner-revoke"]);
    expect(mocks.rpc).toHaveBeenCalledWith("disconnect_gateway_connection", { p_person_id: "person-1" });
  });

  it("keeps successful DB fencing successful when runner revocation is unavailable", async () => {
    mocks.from.mockReturnValue(query({ data: { session_ref: "gw_previous-ref" }, error: null }));
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("runner offline with private detail"); }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(disconnectGatewayForPerson("person-1")).resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it("bounds runner revocation when the control request never completes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")), { once: true });
    })));

    const pending = revokeGatewayRunnerSession("gw_stale-ref");
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(pending).resolves.toBe(false);
  });
});
