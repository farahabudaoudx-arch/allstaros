import { describe, expect, it } from "vitest";
import {
  assertNoSecretLikeValue,
  colorValue,
  emailFromValue,
  httpsUrlValue,
  integerRangeValue,
  providerBillingUrlValue,
  requiredHttpsUrlValue,
  safeReference,
} from "./validation";

describe("Whitelabel intake secret policy", () => {
  it.each([
    "Bearer abcdefghijklmnopqrstuvwxyz123456",
    "api_key=abcdefghijklmnop123456",
    "password: super-secret-value",
    "token=abcdefghijklmnop123456",
    "sk_live_abcdefghijklmnop",
    "sk-proj-abcdefghijklmnop123456",
    "sbp_abcdefghijklmnop1234567890",
    "ghp_abcdefghijklmnopqrstuvwxyz123456",
    "sb_secret_abcdefghijklmnopqrstuvwxyz123456",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.abcdefghijklmnop",
    "-----BEGIN PRIVATE KEY-----",
  ])("rejects secret-like persisted text: %s", (value) => {
    expect(() => assertNoSecretLikeValue(value, "Field")).toThrow(/credential|token/i);
  });

  it("allows ordinary account and project references", () => {
    const form = new FormData();
    form.set("ref", "team_acme-production-01");
    expect(safeReference(form.get("ref"), "Reference")).toBe("team_acme-production-01");
  });

  it("accepts safe HTTPS billing links and rejects embedded credentials", () => {
    const safe = new FormData();
    safe.set("url", "https://vercel.com/acme/~/usage");
    expect(httpsUrlValue(safe.get("url"), "Billing link")).toBe("https://vercel.com/acme/~/usage");

    const unsafe = new FormData();
    unsafe.set("url", "https://user:password@example.com/billing");
    expect(() => httpsUrlValue(unsafe.get("url"), "Billing link")).toThrow(/HTTPS URL/i);
  });

  it("constrains known provider billing links to the provider host", () => {
    const vercel = new FormData();
    vercel.set("url", "https://vercel.com/acme/~/usage");
    expect(providerBillingUrlValue(vercel.get("url"), "Billing link", "vercel")).toContain("vercel.com");

    const fakeVercel = new FormData();
    fakeVercel.set("url", "https://example.com/vercel-usage");
    expect(() => providerBillingUrlValue(fakeVercel.get("url"), "Billing link", "vercel")).toThrow(
      /vercel\.com/i,
    );

    const fakeSupabase = new FormData();
    fakeSupabase.set("url", "https://example.com/supabase-billing");
    expect(() => providerBillingUrlValue(fakeSupabase.get("url"), "Billing link", "supabase")).toThrow(
      /supabase\.com/i,
    );
  });

  it("normalizes valid brand colors and rejects non-hex values", () => {
    const valid = new FormData();
    valid.set("color", "#0f172a");
    expect(colorValue(valid.get("color"), "Brand color")).toBe("#0F172A");

    const invalid = new FormData();
    invalid.set("color", "blue");
    expect(() => colorValue(invalid.get("color"), "Brand color")).toThrow(/6-digit hex/i);
  });

  it("validates sender identities, required HTTPS URLs, and bounded integers", () => {
    expect(emailFromValue("Acme Life <Notifications@Acme.test>")).toBe(
      "Acme Life <notifications@acme.test>",
    );
    expect(requiredHttpsUrlValue("https://portal.acme.test/path", "URL")).toBe(
      "https://portal.acme.test/path",
    );
    expect(integerRangeValue("28", "Days", 1, 365)).toBe(28);
    expect(() => integerRangeValue("1.5", "Days", 1, 365)).toThrow(/whole number/i);
  });
});
