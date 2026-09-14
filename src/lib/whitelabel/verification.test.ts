import { describe, expect, it } from "vitest";
import { addBusinessDays, buildHandoffVerificationItems, verificationCanPass, verifyLiveInstallationVersion } from "./verification";
import type { WhitelabelBuildAddition, WhitelabelServiceConnection } from "./types";

function service(kind: WhitelabelServiceConnection["service_kind"]): WhitelabelServiceConnection {
  return {
    id: `${kind}-id`, build_id: "build", service_kind: kind, required: true, status: "verified",
    account_label: null, provider_name: kind, account_ref: `${kind}-account`, project_ref: kind === "vercel" || kind === "supabase" ? `${kind}-project` : null,
    login_email: null, billing_url: null, next_action: null, verification_method: "provider_api",
    credential_secret_id: `${kind}-vault`, configuration: {}, verified_by: "person", status_updated_at: "2026-09-14T00:00:00Z",
    last_checked_at: "2026-09-14T00:00:00Z", created_at: "2026-09-14T00:00:00Z", updated_at: "2026-09-14T00:00:00Z",
  };
}

function addition(id: string, phase: "launch" | "post_handoff"): WhitelabelBuildAddition {
  return {
    id, build_id: "build", addition_type: "custom_feature", name: `Feature ${id}`,
    delivery_requirements: "Acceptance behavior verified", timeline_notes: null, status: phase === "launch" ? "ready" : "in_progress",
    delivery_phase: phase, created_at: "2026-09-14T00:00:00Z", updated_at: "2026-09-14T00:00:00Z",
  };
}

describe("handoff verification catalog", () => {
  it("requires actual launch-addition evidence but honestly defers post-handoff work", () => {
    const items = buildHandoffVerificationItems({
      additions: [addition("launch", "launch"), addition("later", "post_handoff")],
      services: [service("vercel"), service("supabase"), service("email"), service("ai")],
      maintenanceStatus: "declined",
      sourceSha: "1247f2c2bbbbbb49223fe117f6006877390ab76a",
      deploymentUrl: "https://customer.example.com",
      liveVersion: { ok: true, summary: "matched", evidence: { osUrl: "https://customer.example.com", expectedSha: "1247f2c2bbbbbb49223fe117f6006877390ab76a", actualSha: "1247f2c2bbbbbb49223fe117f6006877390ab76a", expectedSchema: "20260914004000_whitelabel_content_services", actualSchema: "20260914004000_whitelabel_content_services" } },
    });
    expect(items.find((item) => item.checkKey === "addition:launch")).toMatchObject({ requiredForHandoff: true, status: "pending" });
    expect(items.find((item) => item.checkKey === "addition:later")).toMatchObject({ requiredForHandoff: false, status: "deferred" });
    expect(items.find((item) => item.checkKey === "maintenance-onboarding")).toMatchObject({ requiredForHandoff: false, status: "not_applicable" });
  });

  it("requires maintenance onboarding evidence when maintenance is selected", () => {
    const items = buildHandoffVerificationItems({ additions: [], services: [service("vercel"), service("supabase"), service("email"), service("ai")], maintenanceStatus: "selected", sourceSha: "abcdef1234567", deploymentUrl: "https://customer.example.com", liveVersion: { ok: true, summary: "matched", evidence: { osUrl: "https://customer.example.com", expectedSha: "abcdef1234567", actualSha: "abcdef1234567", expectedSchema: "20260914004000_whitelabel_content_services", actualSchema: "20260914004000_whitelabel_content_services" } } });
    expect(items.find((item) => item.checkKey === "maintenance-onboarding")).toMatchObject({ requiredForHandoff: true, status: "pending" });
  });

  it("does not pass while any required check is pending", () => {
    expect(verificationCanPass([{ requiredForHandoff: true, status: "passed" }, { requiredForHandoff: true, status: "pending" }])).toBe(false);
    expect(verificationCanPass([{ requiredForHandoff: true, status: "passed" }, { requiredForHandoff: false, status: "deferred" }])).toBe(true);
  });

  it("calculates five business days without counting weekends", () => {
    const monday = new Date("2026-09-14T12:00:00Z");
    expect(addBusinessDays(monday, 5).toISOString()).toBe("2026-09-21T12:00:00.000Z");
    const friday = new Date("2026-09-18T12:00:00Z");
    expect(addBusinessDays(friday, 1).toISOString()).toBe("2026-09-21T12:00:00.000Z");
  });

  it("verifies both source SHA and schema release from the live customer URL", async () => {
    const fetcher = async () => new Response(JSON.stringify({ sha: "abc1234", schemaRelease: "schema-1" }), { status: 200 });
    await expect(verifyLiveInstallationVersion({ osUrl: "https://customer.example.com/", expectedSha: "abc1234", expectedSchema: "schema-1", fetcher: fetcher as typeof fetch })).resolves.toMatchObject({ ok: true });
    await expect(verifyLiveInstallationVersion({ osUrl: "https://customer.example.com", expectedSha: "abc1234", expectedSchema: "schema-2", fetcher: fetcher as typeof fetch })).resolves.toMatchObject({ ok: false });
  });
});
