import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260914003000_whitelabel_provisioning.sql"),
  "utf8",
);

describe("Whitelabel provisioning control-plane SQL", () => {
  it("persists durable run/step state with one active run per build", () => {
    expect(sql).toContain("create table if not exists public.whitelabel_provisioning_run");
    expect(sql).toContain("create table if not exists public.whitelabel_provisioning_step");
    expect(sql).toContain("whitelabel_provisioning_one_active_build_idx");
    expect(sql).toContain("unique (run_id, step_key)");
    expect(sql).toContain("request_key uuid not null default gen_random_uuid()");
  });

  it("keeps generated secrets in Vault references only", () => {
    expect(sql).toContain("vault_secret_id uuid not null");
    expect(sql).toContain("vault.create_secret");
    expect(sql).toContain("vault.update_secret");
    expect(sql).toContain("vault.decrypted_secrets");
    expect(sql).not.toMatch(/password\s+text/i);
    expect(sql).not.toMatch(/access_token\s+text/i);
    expect(sql).not.toMatch(/api_key\s+text/i);
  });

  it("denies direct browser access and keeps control-plane tables service-role only", () => {
    for (const table of ["whitelabel_provisioning_run", "whitelabel_provisioning_step", "whitelabel_provisioning_secret"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated`);
    }
  });

  it("requires API evidence for a verified Resend connection", () => {
    expect(sql).toContain("whitelabel_email_verified_evidence");
    expect(sql).toContain("lower(provider_name) = 'resend'");
    expect(sql).toContain("credential_secret_id is not null");
    expect(sql).toContain("verification_method = 'provider_api'");
  });
});
