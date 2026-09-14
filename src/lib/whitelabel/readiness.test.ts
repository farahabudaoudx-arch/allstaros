import { describe, expect, it } from "vitest";
import { getBuildReadiness } from "./readiness";
import type {
  WhitelabelBuild,
  WhitelabelBuildAddition,
  WhitelabelServiceConnection,
} from "./types";

const BUILD_ID = "11111111-1111-4111-8111-111111111111";

function build(overrides: Partial<WhitelabelBuild> = {}): WhitelabelBuild {
  return {
    id: BUILD_ID,
    agency_name: "Acme Life",
    product_name: "Acme OS",
    short_name: "Acme",
    primary_contact_name: "Alex Owner",
    primary_contact_email: "owner@acme.test",
    initial_admin_name: "Jamie Admin",
    initial_admin_email: "admin@acme.test",
    domain: "os.acme.test",
    timezone: "America/Chicago",
    payment_status: "paid",
    standard_scope_confirmed: true,
    maintenance_status: "selected",
    notes: null,
    brand_primary_color: "#0F172A",
    brand_accent_color: "#38BDF8",
    logo_path: `${BUILD_ID}/logo`,
    favicon_path: `${BUILD_ID}/favicon`,
    support_email: "support@acme.test",
    reply_to_email: "support@acme.test",
    email_from: "Acme Life <notifications@acme.test>",
    licensing_provider_name: "Acme Licensing",
    licensing_code: "ACME-123",
    licensing_login_url: "https://licensing.acme.test/login",
    licensing_requirements_url: "https://licensing.acme.test/requirements",
    licensing_application_url: "https://licensing.acme.test/apply",
    graduation_policy_count: 8,
    graduation_window_days: 28,
    stall_persisted_lapse_days: 3,
    stall_exam_unscheduled_days: 3,
    stall_no_checkin_days: 2,
    stall_checkin_lapsed_days: 2,
    created_by: null,
    updated_by: null,
    created_at: "2026-09-14T00:00:00Z",
    updated_at: "2026-09-14T00:00:00Z",
    ...overrides,
  };
}

function service(
  kind: WhitelabelServiceConnection["service_kind"],
  overrides: Partial<WhitelabelServiceConnection> = {},
): WhitelabelServiceConnection {
  return {
    id: `service-${kind}`,
    build_id: BUILD_ID,
    service_kind: kind,
    required: kind !== "video",
    status: kind === "video" ? "not_required" : "verified",
    account_label: kind === "video" ? null : `${kind} customer account`,
    provider_name:
      kind === "vercel"
        ? "Vercel"
        : kind === "supabase"
          ? "Supabase"
          : kind === "email"
            ? "Resend"
            : kind === "ai"
              ? "OpenAI"
              : "",
    account_ref: kind === "video" ? null : `${kind}-account-123`,
    project_ref: kind === "vercel" || kind === "supabase" ? `${kind}-project-123` : null,
    login_email: null,
    billing_url: null,
    next_action: null,
    verification_method:
      kind === "vercel" || kind === "supabase" || kind === "email" ? "provider_api" : "manual",
    credential_secret_id:
      kind === "vercel" || kind === "supabase" || kind === "email"
        ? "55555555-5555-4555-8555-555555555555"
        : null,
    verified_by: kind === "video" ? null : "admin-1",
    status_updated_at: "2026-09-14T00:00:00Z",
    last_checked_at: kind === "video" ? null : "2026-09-14T00:00:00Z",
    created_at: "2026-09-14T00:00:00Z",
    updated_at: "2026-09-14T00:00:00Z",
    ...overrides,
  };
}

function completeServices(): WhitelabelServiceConnection[] {
  return [service("vercel"), service("supabase"), service("email"), service("video"), service("ai")];
}

describe("Whitelabel build readiness", () => {
  it("is ready only when intake, payment, scope, and core service evidence are complete", () => {
    expect(getBuildReadiness(build(), completeServices(), [])).toEqual({ ready: true, missing: [] });
  });

  it("blocks pending payment and incomplete intake/scope", () => {
    const result = getBuildReadiness(
      build({
        primary_contact_name: "",
        primary_contact_email: "",
        initial_admin_email: "",
        domain: "",
        brand_primary_color: "",
        brand_accent_color: "",
        logo_path: null,
        favicon_path: null,
        payment_status: "pending",
        standard_scope_confirmed: false,
      }),
      completeServices(),
      [],
    );
    expect(result.ready).toBe(false);
    expect(result.missing.map((issue) => issue.key)).toEqual(
      expect.arrayContaining([
        "primary_contact_name",
        "primary_contact_email",
        "initial_admin_email",
        "domain",
        "brand_primary_color",
        "brand_accent_color",
        "logo_path",
        "favicon_path",
        "payment_status",
        "standard_scope_confirmed",
      ]),
    );
  });

  it.each(["missing", "provided", "needs_owner_action", "failed"] as const)(
    "blocks a required service in %s state",
    (status) => {
      const services = completeServices().map((row) =>
        row.service_kind === "vercel" ? { ...row, status } : row,
      );
      const result = getBuildReadiness(build(), services, []);
      expect(result.ready).toBe(false);
      expect(result.missing.some((issue) => issue.key === "service:vercel")).toBe(true);
    },
  );

  it("does not let a core service become optional to bypass readiness", () => {
    const services = completeServices().map((row) =>
      row.service_kind === "email"
        ? { ...row, required: false, status: "not_required" as const, account_ref: null, last_checked_at: null }
        : row,
    );
    const result = getBuildReadiness(build(), services, []);
    expect(result.ready).toBe(false);
    expect(result.missing.some((issue) => issue.key === "service:email")).toBe(true);
  });

  it("allows optional video to remain unconnected, but blocks it when explicitly required", () => {
    expect(getBuildReadiness(build(), completeServices(), []).ready).toBe(true);
    const requiredVideo = completeServices().map((row) =>
      row.service_kind === "video" ? { ...row, required: true, status: "missing" as const } : row,
    );
    expect(getBuildReadiness(build(), requiredVideo, []).ready).toBe(false);
  });

  it("blocks a claimed verified service whose evidence is incomplete", () => {
    const services = completeServices().map((row) =>
      row.service_kind === "supabase" ? { ...row, project_ref: null } : row,
    );
    const result = getBuildReadiness(build(), services, []);
    expect(result.ready).toBe(false);
    expect(result.missing.some((issue) => issue.key === "service:supabase:verification-evidence")).toBe(true);
  });

  it("blocks provider verification evidence when the reusable Vault credential reference is missing", () => {
    const services = completeServices().map((row) =>
      row.service_kind === "vercel" ? { ...row, credential_secret_id: null } : row,
    );
    const result = getBuildReadiness(build(), services, []);
    expect(result.ready).toBe(false);
    expect(result.missing.some((issue) => issue.key === "service:vercel:verification-evidence")).toBe(true);
  });

  it("requires provider-verified Resend evidence for the required email service", () => {
    const services = completeServices().map((row) =>
      row.service_kind === "email"
        ? { ...row, verification_method: "manual" as const, credential_secret_id: null }
        : row,
    );
    const result = getBuildReadiness(build(), services, []);
    expect(result.ready).toBe(false);
    expect(result.missing.some((issue) => issue.key === "service:email:verification-evidence")).toBe(true);
  });

  it("requires delivery requirements for each purchased addition", () => {
    const addition: WhitelabelBuildAddition = {
      id: "22222222-2222-4222-8222-222222222222",
      build_id: BUILD_ID,
      addition_type: "custom_feature",
      name: "Custom dashboard",
      delivery_requirements: "",
      timeline_notes: null,
      status: "planned",
      created_at: "2026-09-14T00:00:00Z",
      updated_at: "2026-09-14T00:00:00Z",
    };
    const result = getBuildReadiness(build(), completeServices(), [addition]);
    expect(result.ready).toBe(false);
    expect(result.missing.some((issue) => issue.key.includes(addition.id))).toBe(true);
  });

  it("ignores child rows belonging to another build", () => {
    const foreignService = service("vercel", {
      id: "foreign-service",
      build_id: "33333333-3333-4333-8333-333333333333",
      status: "failed",
    });
    const foreignAddition: WhitelabelBuildAddition = {
      id: "44444444-4444-4444-8444-444444444444",
      build_id: "33333333-3333-4333-8333-333333333333",
      addition_type: "other",
      name: "Other build only",
      delivery_requirements: "",
      timeline_notes: null,
      status: "blocked",
      created_at: "2026-09-14T00:00:00Z",
      updated_at: "2026-09-14T00:00:00Z",
    };
    expect(getBuildReadiness(build(), [...completeServices(), foreignService], [foreignAddition]).ready).toBe(true);
  });
});
