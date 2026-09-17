import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const localPilot = vi.hoisted(() => ({
  enabled: false,
  project: vi.fn(),
}));
vi.mock("@/lib/local-pilot", () => ({
  isWhitelabelLocalPilot: () => localPilot.enabled,
  localPilotProject: localPilot.project,
}));

import {
  verifySupabaseProjectAccess,
  verifyVercelProjectAccess,
} from "./provider-verification";

describe("Whitelabel provider access verification", () => {
  it("verifies local Vercel and Supabase projects from the rehearsal registry without cloud fetches", async () => {
    localPilot.enabled = true;
    localPilot.project.mockResolvedValue({
      projectRef: "local-customer-b",
      accountRef: "local",
    });
    const fetchMock = vi.fn(async () => {
      throw new Error("cloud fetch should not run in local pilot");
    });

    const vercel = await verifyVercelProjectAccess(
      { accessToken: "ignored", accountRef: "local", projectRef: "local-customer-b" },
      fetchMock as typeof fetch,
    );
    const supabase = await verifySupabaseProjectAccess(
      { accessToken: "ignored", accountRef: "local", projectRef: "local-customer-b" },
      fetchMock as typeof fetch,
    );

    expect(vercel).toMatchObject({ ok: true, providerName: "Vercel", accountRef: "local", projectRef: "local-customer-b" });
    expect(supabase).toMatchObject({ ok: true, providerName: "Supabase", accountRef: "local", projectRef: "local-customer-b" });
    expect(fetchMock).not.toHaveBeenCalled();
    localPilot.enabled = false;
  });

  it("verifies the exact Vercel team/project and returns only safe references", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://api.vercel.com");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer transient-vercel-credential");
      if (url.pathname === "/v9/projects/acme-os") {
        expect(url.searchParams.get("teamId")).toBe("team_acme");
        return new Response(
          JSON.stringify({ id: "prj_acme", name: "acme-os", accountId: "team_acme" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      expect(url.pathname).toBe("/v2/teams/team_acme");
      return new Response(
        JSON.stringify({ id: "team_acme", slug: "acme-agency", name: "Acme Agency" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await verifyVercelProjectAccess(
      {
        accessToken: "transient-vercel-credential",
        accountRef: "team_acme",
        projectRef: "acme-os",
      },
      fetchMock as typeof fetch,
    );

    expect(result).toEqual({
      ok: true,
      providerName: "Vercel",
      accountRef: "team_acme",
      accountLabel: "Acme Agency",
      projectRef: "prj_acme",
      projectName: "acme-os",
      billingUrl: "https://vercel.com/acme-agency/~/usage",
    });
    expect(JSON.stringify(result)).not.toContain("transient-vercel-credential");
  });

  it("rejects a Vercel project returned for a different customer team", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "prj_other", name: "other", accountId: "team_other" }), {
        status: 200,
      }),
    );
    const result = await verifyVercelProjectAccess(
      { accessToken: "temporary", accountRef: "team_acme", projectRef: "acme-os" },
      fetchMock as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/different account/i);
  });

  it("verifies Supabase and resolves the actual organization/project refs", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.supabase.com/v1/projects/acmeprojectref");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer transient-supabase-credential");
      return new Response(
        JSON.stringify({
          ref: "acmeprojectref",
          name: "Acme Production",
          organization_id: "org_123",
          organization_slug: "acme-agency",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await verifySupabaseProjectAccess(
      {
        accessToken: "transient-supabase-credential",
        accountRef: "acme-agency",
        projectRef: "acmeprojectref",
      },
      fetchMock as typeof fetch,
    );
    expect(result).toEqual({
      ok: true,
      providerName: "Supabase",
      accountRef: "acme-agency",
      accountLabel: "acme-agency",
      projectRef: "acmeprojectref",
      projectName: "Acme Production",
      billingUrl: "https://supabase.com/dashboard/org/acme-agency/usage",
    });
    expect(JSON.stringify(result)).not.toContain("transient-supabase-credential");
  });

  it("maps provider authorization failures to a safe actionable message", async () => {
    const fetchMock = vi.fn(async () => new Response("sensitive provider body", { status: 403 }));
    const result = await verifySupabaseProjectAccess(
      { accessToken: "temporary", accountRef: null, projectRef: "acmeprojectref" },
      fetchMock as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/access was denied/i);
      expect(result.error).not.toContain("sensitive provider body");
    }
  });
});
