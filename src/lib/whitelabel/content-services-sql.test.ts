import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260914004000_whitelabel_content_services.sql"),
  "utf8",
);

describe("Whitelabel Ticket 4 schema", () => {
  it("supports every managed library without seeding customer content", () => {
    for (const library of ["recruit", "live", "bootcamp", "accelerator", "uplevel", "all-star-tv", "live-dials", "case-studies"]) {
      expect(sql).toContain(`'${library}'`);
    }
    expect(sql).not.toMatch(/insert\s+into\s+(?:public\.)?training_content/i);
  });

  it("keeps non-secret service bindings customer-local and service-role only", () => {
    expect(sql).toContain("create table if not exists public.installation_service_binding");
    expect(sql).toContain("alter table public.installation_service_binding enable row level security");
    expect(sql).toContain("revoke all on table public.installation_service_binding from anon, authenticated");
    expect(sql).toContain("configuration jsonb");
    expect(sql).not.toMatch(/api_key\s+text/i);
    expect(sql).not.toMatch(/password\s+text/i);
  });

  it("does not allow AI/video to be called verified without Vault/API evidence", () => {
    expect(sql).toContain("to_regclass('public.whitelabel_service_connection')");
    expect(sql).toContain("whitelabel_content_service_verified_evidence");
    expect(sql).toContain("service_kind not in ('video', 'ai')");
    expect(sql).toContain("credential_secret_id is not null");
    expect(sql).toContain("verification_method = 'provider_api'");
  });
});
