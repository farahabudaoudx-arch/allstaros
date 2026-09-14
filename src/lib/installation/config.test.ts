import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { getInstallationCarrierLinks, getInstallationConfig } from "./config";

function configClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })) };
}

function carrierClient(result: { data: unknown[] | null; error: unknown }) {
  const secondOrder = vi.fn().mockResolvedValue(result);
  const firstOrder = vi.fn(() => ({ order: secondOrder }));
  const select = vi.fn(() => ({ order: firstOrder }));
  return { from: vi.fn(() => ({ select })) };
}

describe("installation config loader", () => {
  beforeEach(() => mocks.createServiceRoleClient.mockReset());

  it("maps the customer singleton into the runtime shape", async () => {
    mocks.createServiceRoleClient.mockReturnValue(configClient({
      error: null,
      data: {
        organization_name: "Acme Agency",
        short_name: "Acme",
        product_name: "Acme OS",
        metadata_description: "Acme description",
        timezone: "America/Denver",
        brand_primary_color: "#112233",
        brand_accent_color: "#445566",
        logo_url: "https://assets.acme.test/logo.png",
        favicon_url: "https://assets.acme.test/favicon.png",
        support_email: "support@acme.test",
        reply_to_email: "reply@acme.test",
        licensing_provider_name: "Study Co",
        licensing_code: "ACME-CODE",
        licensing_login_url: "https://study.acme.test",
        licensing_requirements_url: "https://study.acme.test/requirements",
        licensing_application_url: "https://license.acme.test",
        graduation_policy_count: 6,
        graduation_window_days: 21,
        stall_persisted_lapse_days: 4,
        stall_exam_unscheduled_days: 5,
        stall_no_checkin_days: 3,
        stall_checkin_lapsed_days: 3,
      },
    }));

    await expect(getInstallationConfig()).resolves.toMatchObject({
      organizationName: "Acme Agency",
      shortName: "Acme",
      productName: "Acme OS",
      timezone: "America/Denver",
      licensingCode: "ACME-CODE",
      graduationPolicyCount: 6,
      stallExamUnscheduledDays: 5,
    });
  });

  it("fails closed to the current All Star defaults when the table is unavailable", async () => {
    mocks.createServiceRoleClient.mockReturnValue(configClient({ data: null, error: { message: "missing" } }));
    await expect(getInstallationConfig()).resolves.toMatchObject({
      organizationName: "All Star Life Group",
      productName: "All Star OS",
      timezone: "America/Chicago",
    });
  });

  it("loads customer carrier links in persisted order", async () => {
    mocks.createServiceRoleClient.mockReturnValue(carrierClient({
      error: null,
      data: [{
        key: "acme",
        company_key: "acme life",
        display_name: "Acme Life",
        portal_url: "https://portal.acme.test",
        sort_order: 10,
        show_in_resources: true,
      }],
    }));
    await expect(getInstallationCarrierLinks()).resolves.toEqual([{
      key: "acme",
      companyKey: "acme life",
      displayName: "Acme Life",
      portalUrl: "https://portal.acme.test",
      sortOrder: 10,
      showInResources: true,
    }]);
  });
});
