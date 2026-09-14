import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createServiceRoleClient: vi.fn(),
  writeAudit: vi.fn(),
  revalidatePath: vi.fn(),
  verifyVercelProjectAccess: vi.fn(),
  verifySupabaseProjectAccess: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/admin/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/whitelabel/provider-verification", () => ({
  verifyVercelProjectAccess: mocks.verifyVercelProjectAccess,
  verifySupabaseProjectAccess: mocks.verifySupabaseProjectAccess,
}));

import {
  adminDeleteOsBuildAddition,
  adminSaveOsBuildService,
  adminUpdateOsBuildAddition,
  adminVerifyOsBuildProviderAccess,
} from "./os-builds";

const BUILD_ID = "11111111-1111-4111-8111-111111111111";
const ADDITION_ID = "22222222-2222-4222-8222-222222222222";

type EqCall = [column: string, value: string];

function updateAdmin(tableName: string) {
  const eqCalls: EqCall[] = [];
  const updatePayloads: Array<Record<string, unknown>> = [];
  const chain = {
    eq: vi.fn((column: string, value: string) => {
      eqCalls.push([column, value]);
      return chain;
    }),
    select: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: { id: "row-1" }, error: null })),
  };
  const admin = {
    from: vi.fn((table: string) => {
      if (table !== tableName) throw new Error(`unexpected table ${table}`);
      return {
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return chain;
        }),
      };
    }),
  };
  return { admin, eqCalls, updatePayloads };
}

function serviceForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const values = {
    build_id: BUILD_ID,
    service_kind: "vercel",
    required: "on",
    status: "failed",
    account_label: "Acme Vercel",
    account_ref: "team_acme",
    project_ref: "prj_acme",
    login_email: "owner@acme.test",
    billing_url: "https://vercel.com/acme/~/usage",
    next_action: "Owner should grant project access.",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  if (overrides.required === "") form.delete("required");
  return form;
}

function additionForm() {
  const form = new FormData();
  form.set("build_id", BUILD_ID);
  form.set("addition_id", ADDITION_ID);
  form.set("addition_type", "custom_feature");
  form.set("name", "Custom dashboard");
  form.set("delivery_requirements", "Deliver the agreed dashboard and acceptance checks.");
  form.set("timeline_notes", "After base handoff.");
  form.set("status", "planned");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1", is_admin: true, is_super_admin: false });
  mocks.writeAudit.mockResolvedValue(undefined);
  mocks.verifyVercelProjectAccess.mockResolvedValue({
    ok: true,
    providerName: "Vercel",
    accountRef: "team_acme",
    accountLabel: null,
    projectRef: "prj_acme",
    projectName: "acme-os",
    billingUrl: "https://vercel.com/acme-agency/~/usage",
  });
});

describe("Whitelabel OS build admin action boundary", () => {
  it("authorizes before constructing a service-role client", async () => {
    const events: string[] = [];
    mocks.requireAdmin.mockImplementation(async () => {
      events.push("auth");
      return { id: "admin-1", is_admin: true };
    });
    const { admin } = updateAdmin("whitelabel_service_connection");
    mocks.createServiceRoleClient.mockImplementation(() => {
      events.push("service-role");
      return admin;
    });

    await expect(adminSaveOsBuildService(serviceForm())).rejects.toThrow(/REDIRECT:/);
    expect(events.slice(0, 2)).toEqual(["auth", "service-role"]);
  });

  it("never constructs the privileged client when admin authorization fails", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("not admin"));
    await expect(adminSaveOsBuildService(serviceForm())).rejects.toThrow("not admin");
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("rejects secret-like account data before any database access", async () => {
    await expect(
      adminSaveOsBuildService(
        serviceForm({ account_ref: "Bearer abcdefghijklmnopqrstuvwxyz123456", status: "provided" }),
      ),
    ).rejects.toThrow(/REDIRECT:.*credential|REDIRECT:.*token/i);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("cannot mark a standard core service optional to bypass readiness", async () => {
    await expect(
      adminSaveOsBuildService(serviceForm({ required: "", status: "not_required" })),
    ).rejects.toThrow(/REDIRECT:.*required/i);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("scopes service mutations by both build and service kind and preserves intake on failures", async () => {
    const { admin, eqCalls, updatePayloads } = updateAdmin("whitelabel_service_connection");
    mocks.createServiceRoleClient.mockReturnValue(admin);

    await expect(adminSaveOsBuildService(serviceForm({ status: "failed" }))).rejects.toThrow(/REDIRECT:/);
    expect(admin.from).toHaveBeenCalledTimes(1);
    expect(admin.from).toHaveBeenCalledWith("whitelabel_service_connection");
    expect(eqCalls).toContainEqual(["build_id", BUILD_ID]);
    expect(eqCalls).toContainEqual(["service_kind", "vercel"]);
    expect(updatePayloads[0]).toMatchObject({ status: "failed", account_ref: "team_acme" });
    expect(updatePayloads[0]).not.toHaveProperty("agency_name");
    expect(updatePayloads[0]).not.toHaveProperty("payment_status");
  });

  it("scopes purchased-work mutations by both build id and addition id", async () => {
    const { admin, eqCalls } = updateAdmin("whitelabel_build_addition");
    mocks.createServiceRoleClient.mockReturnValue(admin);

    await expect(adminUpdateOsBuildAddition(additionForm())).rejects.toThrow(/REDIRECT:/);
    expect(eqCalls).toContainEqual(["build_id", BUILD_ID]);
    expect(eqCalls).toContainEqual(["id", ADDITION_ID]);
  });

  it("keeps provider authorization out of ordinary rows/audit and stores it only through the vault RPC", async () => {
    const eqCalls: EqCall[] = [];
    const updatePayloads: Array<Record<string, unknown>> = [];
    const chain = {
      error: null,
      eq: vi.fn((column: string, value: string) => {
        eqCalls.push([column, value]);
        return chain;
      }),
      select: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: { id: "service-1", account_label: "Acme team" },
        error: null,
      })),
    };
    const admin = {
      rpc: vi.fn(async () => ({ data: "vault-secret-id", error: null })),
      from: vi.fn((table: string) => {
        if (table !== "whitelabel_service_connection") throw new Error(`unexpected table ${table}`);
        return {
          select: vi.fn(() => chain),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatePayloads.push(payload);
            return chain;
          }),
        };
      }),
    };
    mocks.createServiceRoleClient.mockReturnValue(admin);

    const form = new FormData();
    form.set("build_id", BUILD_ID);
    form.set("service_kind", "vercel");
    form.set("account_ref", "team_acme");
    form.set("project_ref", "acme-os");
    form.set("access_token", "temporary-provider-credential");

    await expect(adminVerifyOsBuildProviderAccess(form)).rejects.toThrow(/REDIRECT:/);
    expect(mocks.verifyVercelProjectAccess).toHaveBeenCalledWith({
      accessToken: "temporary-provider-credential",
      accountRef: "team_acme",
      projectRef: "acme-os",
    });
    expect(admin.rpc).toHaveBeenCalledWith("store_whitelabel_service_credential", {
      p_build_id: BUILD_ID,
      p_service_kind: "vercel",
      p_secret: "temporary-provider-credential",
    });
    expect(updatePayloads).toHaveLength(1);
    expect(JSON.stringify(updatePayloads[0])).not.toContain("temporary-provider-credential");
    expect(updatePayloads[0]).toMatchObject({
      status: "verified",
      verification_method: "provider_api",
      account_ref: "team_acme",
      project_ref: "prj_acme",
      billing_url: "https://vercel.com/acme-agency/~/usage",
    });
    expect(eqCalls).toContainEqual(["build_id", BUILD_ID]);
    expect(eqCalls).toContainEqual(["service_kind", "vercel"]);
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("temporary-provider-credential");
  });

  it("does not report a stale or foreign addition id as successfully deleted", async () => {
    const chain = {
      eq: vi.fn(() => chain),
      select: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const admin = {
      from: vi.fn(() => ({ delete: vi.fn(() => chain) })),
    };
    mocks.createServiceRoleClient.mockReturnValue(admin);

    const form = new FormData();
    form.set("build_id", BUILD_ID);
    form.set("addition_id", ADDITION_ID);
    await expect(adminDeleteOsBuildAddition(form)).rejects.toThrow(/not%20found/i);
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
