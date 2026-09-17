import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createServiceRoleClient: vi.fn(),
  writeAudit: vi.fn(),
  revalidatePath: vi.fn(),
  localPilotEnabled: false,
  verifyVercelProjectAccess: vi.fn(),
  verifySupabaseProjectAccess: vi.fn(),
  verifyResendSenderAccess: vi.fn(),
  verifyAnthropicAccess: vi.fn(),
  verifyBunnyVideoAccess: vi.fn(),
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
vi.mock("@/lib/local-pilot", () => ({ isWhitelabelLocalPilot: () => mocks.localPilotEnabled }));
vi.mock("@/lib/whitelabel/provider-verification", () => ({
  verifyVercelProjectAccess: mocks.verifyVercelProjectAccess,
  verifySupabaseProjectAccess: mocks.verifySupabaseProjectAccess,
}));
vi.mock("@/lib/whitelabel/email-verification", () => ({
  verifyResendSenderAccess: mocks.verifyResendSenderAccess,
}));
vi.mock("@/lib/whitelabel/content-service-verification", () => ({
  verifyAnthropicAccess: mocks.verifyAnthropicAccess,
  verifyBunnyVideoAccess: mocks.verifyBunnyVideoAccess,
}));

import {
  adminDeleteOsBuildAddition,
  adminSaveOsBuildService,
  adminUpdateOsBuildAddition,
  adminVerifyOsBuildAiAccess,
  adminVerifyOsBuildEmailAccess,
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
  mocks.localPilotEnabled = false;
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
  mocks.verifyAnthropicAccess.mockResolvedValue({
    ok: true,
    providerName: "Anthropic",
    accountRef: "anthropic",
    accountLabel: "Anthropic API",
    billingUrl: "https://console.anthropic.com/settings/billing",
    configuration: { provider: "anthropic" },
  });
  mocks.verifyResendSenderAccess.mockResolvedValue({
    ok: true,
    providerName: "Resend",
    accountRef: "local-resend-customer-a.local",
    accountLabel: "customer-a.local",
    billingUrl: "https://resend.com/domains",
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

  it("uses a harmless Vault credential for local provider verification without a secret form field", async () => {
    mocks.localPilotEnabled = true;
    const updatePayloads: Array<Record<string, unknown>> = [];
    const chain = {
      error: null,
      eq: vi.fn(() => chain),
      select: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: { id: "service-1", account_label: "Local Vercel" }, error: null })),
    };
    const admin = {
      rpc: vi.fn(async () => ({ data: "vault-local-provider", error: null })),
      from: vi.fn(() => ({
        select: vi.fn(() => chain),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return chain;
        }),
      })),
    };
    mocks.createServiceRoleClient.mockReturnValue(admin);
    mocks.verifyVercelProjectAccess.mockResolvedValueOnce({
      ok: true,
      providerName: "Vercel",
      accountRef: "local",
      accountLabel: "Local Pilot",
      projectRef: "local-customer-b",
      projectName: "local-customer-b",
      billingUrl: "https://vercel.com/~/usage",
    });

    const form = new FormData();
    form.set("build_id", BUILD_ID);
    form.set("service_kind", "vercel");
    form.set("account_ref", "local");
    form.set("project_ref", "local-customer-b");

    await expect(adminVerifyOsBuildProviderAccess(form)).rejects.toThrow(/REDIRECT:/);
    expect(mocks.verifyVercelProjectAccess).toHaveBeenCalledWith({
      accessToken: "local-pilot-vercel-credential",
      accountRef: "local",
      projectRef: "local-customer-b",
    });
    expect(admin.rpc).toHaveBeenCalledWith("store_whitelabel_service_credential", {
      p_build_id: BUILD_ID,
      p_service_kind: "vercel",
      p_secret: "local-pilot-vercel-credential",
    });
    expect(JSON.stringify(updatePayloads)).not.toContain("local-pilot-vercel-credential");
  });

  it("still requires a real provider credential outside local pilot", async () => {
    const form = new FormData();
    form.set("build_id", BUILD_ID);
    form.set("service_kind", "vercel");
    form.set("account_ref", "team_acme");
    form.set("project_ref", "acme-os");

    await expect(adminVerifyOsBuildProviderAccess(form)).rejects.toThrow(/access%20token|required/i);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.verifyVercelProjectAccess).not.toHaveBeenCalled();
  });

  it("keeps the standard AI credential in Vault while persisting only safe adapter metadata", async () => {
    const eqCalls: EqCall[] = [];
    const updatePayloads: Array<Record<string, unknown>> = [];
    const chain = {
      error: null,
      eq: vi.fn((column: string, value: string) => {
        eqCalls.push([column, value]);
        return chain;
      }),
      select: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: { id: "ai-service" }, error: null })),
    };
    const admin = {
      rpc: vi.fn(async () => ({ data: "vault-ai-secret-id", error: null })),
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
    form.set("access_token", "customer-anthropic-secret");

    await expect(adminVerifyOsBuildAiAccess(form)).rejects.toThrow(/REDIRECT:/);
    expect(mocks.verifyAnthropicAccess).toHaveBeenCalledWith("customer-anthropic-secret");
    expect(admin.rpc).toHaveBeenCalledWith("store_whitelabel_service_credential", {
      p_build_id: BUILD_ID,
      p_service_kind: "ai",
      p_secret: "customer-anthropic-secret",
    });
    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toMatchObject({
      status: "verified",
      provider_name: "Anthropic",
      account_ref: "anthropic",
      configuration: { provider: "anthropic" },
      verification_method: "provider_api",
    });
    expect(JSON.stringify(updatePayloads[0])).not.toContain("customer-anthropic-secret");
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("customer-anthropic-secret");
    expect(eqCalls).toContainEqual(["build_id", BUILD_ID]);
    expect(eqCalls).toContainEqual(["service_kind", "ai"]);
  });

  it("uses harmless local Vault credentials for Resend and Anthropic without secret inputs", async () => {
    mocks.localPilotEnabled = true;
    const storedSecrets: Array<Record<string, unknown>> = [];
    const updatePayloads: Array<Record<string, unknown>> = [];
    const updateChain = {
      error: null,
      eq: vi.fn(() => updateChain),
    };
    const buildChain = {
      eq: vi.fn(() => buildChain),
      maybeSingle: vi.fn(async () => ({ data: { email_from: "Pilot <notifications@customer-a.local>" }, error: null })),
    };
    const serviceChain = {
      eq: vi.fn(() => serviceChain),
      maybeSingle: vi.fn(async () => ({ data: { id: "service-1" }, error: null })),
    };
    const admin = {
      rpc: vi.fn(async (_name: string, payload: Record<string, unknown>) => {
        storedSecrets.push(payload);
        return { data: "vault-local-secret", error: null };
      }),
      from: vi.fn((table: string) => {
        if (table === "whitelabel_build") return { select: vi.fn(() => buildChain) };
        if (table === "whitelabel_service_connection") {
          return {
            select: vi.fn(() => serviceChain),
            update: vi.fn((payload: Record<string, unknown>) => {
              updatePayloads.push(payload);
              return updateChain;
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    mocks.createServiceRoleClient.mockReturnValue(admin);

    const emailForm = new FormData();
    emailForm.set("build_id", BUILD_ID);
    await expect(adminVerifyOsBuildEmailAccess(emailForm)).rejects.toThrow(/REDIRECT:/);
    expect(mocks.verifyResendSenderAccess).toHaveBeenCalledWith({
      accessToken: "local-pilot-email-credential",
      emailFrom: "Pilot <notifications@customer-a.local>",
    });

    const aiForm = new FormData();
    aiForm.set("build_id", BUILD_ID);
    await expect(adminVerifyOsBuildAiAccess(aiForm)).rejects.toThrow(/REDIRECT:/);
    expect(mocks.verifyAnthropicAccess).toHaveBeenCalledWith("local-pilot-ai-credential");
    expect(storedSecrets).toEqual(expect.arrayContaining([
      { p_build_id: BUILD_ID, p_service_kind: "email", p_secret: "local-pilot-email-credential" },
      { p_build_id: BUILD_ID, p_service_kind: "ai", p_secret: "local-pilot-ai-credential" },
    ]));
    expect(JSON.stringify(updatePayloads)).not.toContain("local-pilot-email-credential");
    expect(JSON.stringify(updatePayloads)).not.toContain("local-pilot-ai-credential");
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
