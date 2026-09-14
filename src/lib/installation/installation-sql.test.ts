import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260914002000_installation_config.sql"),
  "utf8",
);

describe("installation config migration", () => {
  it("creates one service-role-controlled non-secret installation config", () => {
    expect(sql).toContain("create table if not exists public.installation_config");
    expect(sql).toContain("singleton boolean primary key default true check (singleton)");
    expect(sql).toContain("alter table public.installation_config enable row level security");
    expect(sql).toContain("revoke all on table public.installation_config from anon, authenticated");
    expect(sql).toContain("grant select, insert, update on table public.installation_config to service_role");
    expect(sql).not.toMatch(/\b(access_token|refresh_token|password|api_key)\b/i);
  });

  it("seeds the exact current All Star behavior without overwriting an existing install", () => {
    expect(sql).toContain("'All Star Life Group', 'All Star', 'All Star OS'");
    expect(sql).toContain("'FFLALLSTAR-NGBNCR'");
    expect(sql).toContain("8, 28, 3, 3, 2, 2");
    expect(sql).toContain("on conflict (singleton) do nothing");
  });

  it("centralizes carrier links without mixing them with underwriting commission logic", () => {
    expect(sql).toContain("create table if not exists public.installation_carrier_link");
    expect(sql).toContain("'national life group', 'NLG'");
    expect(sql).not.toMatch(/commission/i);
  });

  it("makes graduation, stalls, and scorecard business dates installation-aware", () => {
    expect(sql).toContain("create or replace function public.installation_timezone()");
    expect(sql).toContain("select graduation_policy_count, graduation_window_days");
    expect(sql).toContain("stall_persisted_lapse_days");
    expect(sql).toContain("make_interval(days => v_window_days)");
    expect(sql).toContain("create or replace function scorecard_population_context");
    expect(sql).toContain("create or replace function scorecard_manual_target_context");
    expect(sql).toContain("at time zone public.installation_timezone()");
    expect(sql).not.toContain("at time zone 'America/Chicago'");
  });
});
