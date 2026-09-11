import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "./middleware";

const key = "sb-test-project-auth-token";
const user = {
  id: "test-user",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
};

function session(expiresAt = 1) {
  return `base64-${Buffer.from(
    JSON.stringify({
      access_token: "old-access",
      refresh_token: "old-refresh",
      expires_at: expiresAt,
      user,
    }),
  ).toString("base64url")}`;
}

function request(path: string, chunked = false) {
  const req = new NextRequest(`https://app.example.com${path}`);
  const value = session();
  if (chunked) {
    req.cookies.set(`${key}.0`, value.slice(0, 80));
    req.cookies.set(`${key}.1`, value.slice(80));
  } else {
    req.cookies.set(key, value);
  }
  req.cookies.set(`${key}-code-verifier`, "keep-verifier");
  req.cookies.set("sb-other-auth-token", "keep-other-project");
  req.cookies.set("theme", "dark");
  return req;
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("session middleware with the real Supabase SSR client", () => {
  for (const code of ["refresh_token_not_found", "refresh_token_already_used"]) {
    for (const chunked of [false, true]) {
      it(`recovers ${code}, chunked=${chunked}, and stops the next request retrying`, async () => {
        fetchMock.mockResolvedValue(
          new Response(JSON.stringify({ code, msg: "Invalid Refresh Token" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "x-supabase-api-version": "2024-01-01",
            },
          }),
        );
        const req = request("/producer?tab=team", chunked);
        const response = await updateSession(req);
        expect(response.status).toBe(307);
        expect(new URL(response.headers.get("location")!).pathname).toBe(
          "/auth/signin",
        );
        expect(
          new URL(response.headers.get("location")!).searchParams.get("next"),
        ).toBe("/producer");
        for (const name of chunked ? [`${key}.0`, `${key}.1`] : [key]) {
          expect(response.cookies.get(name)).toMatchObject({
            value: "",
            maxAge: 0,
            path: "/",
          });
          expect(req.cookies.has(name)).toBe(false);
        }
        expect(req.cookies.get(`${key}-code-verifier`)?.value).toBe(
          "keep-verifier",
        );
        expect(req.cookies.get("sb-other-auth-token")?.value).toBe(
          "keep-other-project",
        );
        expect(response.cookies.has("theme")).toBe(false);
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const next = new NextRequest(response.headers.get("location")!, {
          headers: { cookie: req.cookies.toString() },
        });
        expect((await updateSession(next)).status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    }
  }

  it("allows a cookie-free visitor on sign-in, gates protected routes without an auth call", async () => {
    expect(
      (await updateSession(new NextRequest("https://app.example.com/auth/signin")))
        .status,
    ).toBe(200);
    expect(
      (await updateSession(new NextRequest("https://app.example.com/producer")))
        .status,
    ).toBe(307);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cleans an invalid session on a public route without a redirect loop", async () => {
    const req = request("/auth/signin");
    req.cookies.set(
      key,
      `base64-${Buffer.from(
        JSON.stringify({ access_token: "incomplete" }),
      ).toString("base64url")}`,
    );
    const response = await updateSession(req);
    expect(response.status).toBe(200);
    expect(response.cookies.get(key)?.maxAge).toBe(0);
    expect(req.cookies.has(key)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates rotated session cookies to both the browser and downstream request", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/token?")) {
        return new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "new-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(user), { status: 200 });
    });
    const req = request("/producer", true);
    const response = await updateSession(req);
    expect(response.status).toBe(200);
    expect(response.cookies.get(key)?.value).toContain("base64-");
    expect(req.cookies.get(key)?.value).toBe(response.cookies.get(key)?.value);
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      `${key}=base64-`,
    );
    expect(response.cookies.get(`${key}.1`)?.maxAge).toBe(0);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("preserves session cookies during an Auth service outage", async () => {
    const req = request("/producer");
    const validSession = session(Math.floor(Date.now() / 1000) + 3600);
    req.cookies.set(key, validSession);
    fetchMock.mockResolvedValue(
      new Response("service unavailable", { status: 503 }),
    );
    await expect(updateSession(req)).rejects.toMatchObject({
      name: "AuthRetryableFetchError",
    });
    expect(req.cookies.get(key)?.value).toBe(validSession);
  });

  it("surfaces unrelated auth failures rather than treating them as invalid refresh tokens", async () => {
    const req = request("/producer");
    const validSession = session(Math.floor(Date.now() / 1000) + 3600);
    req.cookies.set(key, validSession);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ code: "unexpected_failure", msg: "unavailable" }),
        {
          status: 400,
          headers: { "x-supabase-api-version": "2024-01-01" },
        },
      ),
    );
    await expect(updateSession(req)).rejects.toMatchObject({
      code: "unexpected_failure",
    });
    expect(req.cookies.get(key)?.value).toBe(validSession);
  });
});
