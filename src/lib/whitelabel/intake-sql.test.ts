import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260914001000_whitelabel_intake.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("Whitelabel Ticket 1 SQL boundary", () => {
  it("creates isolated build, service, and purchased-addition records", () => {
    expect(sql).toContain("create table if not exists public.whitelabel_build (");
    expect(sql).toContain("create table if not exists public.whitelabel_service_connection (");
    expect(sql).toContain("create table if not exists public.whitelabel_build_addition (");
    expect(sql).toContain("build_id uuid not null references public.whitelabel_build(id) on delete cascade");
    expect(sql).toContain("unique (build_id, service_kind)");
  });

  it("keeps the setup tables behind the server-side admin boundary", () => {
    for (const table of [
      "whitelabel_build",
      "whitelabel_service_connection",
      "whitelabel_build_addition",
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated;`);
      expect(sql).toContain(`grant select, insert, update, delete on table public.${table} to service_role;`);
    }
    expect(sql).not.toMatch(/grant\s+.*whitelabel_.*\s+to\s+authenticated/i);
  });

  it("keeps core services required and requires evidence for verified access", () => {
    expect(sql).toContain("check (service_kind = 'video' or required)");
    expect(sql).toContain("status <> 'verified'");
    expect(sql).toContain("account_ref is not null");
    expect(sql).toContain("last_checked_at is not null");
    expect(sql).toContain("service_kind not in ('vercel', 'supabase')");
    expect(sql).toContain("project_ref is not null");
  });

  it("seeds the standard access checklist with video optional only", () => {
    expect(sql).toContain("(new.id, 'vercel', true, 'missing', 'Vercel')");
    expect(sql).toContain("(new.id, 'supabase', true, 'missing', 'Supabase')");
    expect(sql).toContain("(new.id, 'email', true, 'missing', '')");
    expect(sql).toContain("(new.id, 'video', false, 'not_required', '')");
    expect(sql).toContain("(new.id, 'ai', true, 'missing', '')");
    expect(sql).toContain(
      "revoke all on function public.seed_whitelabel_service_connections() from public, anon, authenticated;",
    );
  });

  it("distinguishes manual status from actual Vercel/Supabase API verification", () => {
    expect(sql).toContain("provider_name text not null default ''");
    expect(sql).toContain("verification_method text not null default 'manual'");
    expect(sql).toContain("check (verification_method in ('manual', 'provider_api'))");
    expect(sql).toContain("verification_method = 'provider_api'");
    expect(sql).toContain("credential_secret_id is not null");
    expect(sql).toContain("verified_by uuid references public.person(id)");
    expect(sql).toContain("last_checked_at is not null");
  });

  it("stores reusable provider authorization only in Supabase Vault behind service-role RPCs", () => {
    expect(sql).toContain("create extension if not exists supabase_vault with schema vault;");
    expect(sql).toContain("credential_secret_id uuid");
    expect(sql).toContain("vault.create_secret(");
    expect(sql).toContain("vault.update_secret(");
    expect(sql).toContain("join vault.decrypted_secrets ds on ds.id = sc.credential_secret_id");
    expect(sql).toContain(
      "revoke all on function public.store_whitelabel_service_credential(uuid, text, text)",
    );
    expect(sql).toContain(
      "grant execute on function public.store_whitelabel_service_credential(uuid, text, text)",
    );
    expect(sql).toContain(
      "revoke all on function public.get_whitelabel_service_credential(uuid, text)",
    );
    expect(sql).toContain(
      "grant execute on function public.get_whitelabel_service_credential(uuid, text)",
    );
  });

  it("uses a private, bounded image-only intake bucket", () => {
    expect(sql).toContain("'whitelabel-intake'");
    expect(sql).toContain("false,");
    expect(sql).toContain("5242880");
    expect(sql).toContain("'image/png'");
    expect(sql).toContain("'image/jpeg'");
    expect(sql).toContain("'image/webp'");
    expect(sql).toContain("'image/x-icon'");
    expect(sql).toContain("'image/vnd.microsoft.icon'");
    expect(sql).not.toContain("image/svg+xml");
  });

  it("keeps uploaded branding objects scoped to the build id", () => {
    expect(sql).toContain("logo_path text check (logo_path is null or logo_path like id::text || '/%')");
    expect(sql).toContain("favicon_path text check (favicon_path is null or favicon_path like id::text || '/%')");
    expect(sql).toContain("brand_primary_color text not null default ''");
    expect(sql).toContain("brand_accent_color text not null default ''");
  });

  it("does not define credential-bearing columns", () => {
    expect(sql).not.toMatch(/\b(password|api_key|access_token|refresh_token|secret|cookie|session_state)\s+(text|varchar|jsonb)/i);
  });
});
