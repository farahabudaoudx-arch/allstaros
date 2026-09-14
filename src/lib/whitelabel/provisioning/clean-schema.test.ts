import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CLEAN_CUSTOMER_DATA_SQL,
  CLEAN_CUSTOMER_MIGRATIONS,
  CLEANUP_MIGRATION_KEY,
  migrationMarkerSql,
} from "./clean-schema";

describe("clean customer schema manifest", () => {
  it("contains only real migrations and excludes sample/control-plane migrations", () => {
    for (const name of CLEAN_CUSTOMER_MIGRATIONS) {
      expect(existsSync(path.join(process.cwd(), "supabase", "migrations", name)), name).toBe(true);
    }
    expect(new Set(CLEAN_CUSTOMER_MIGRATIONS).size).toBe(CLEAN_CUSTOMER_MIGRATIONS.length);
    expect(CLEAN_CUSTOMER_MIGRATIONS).toContain("20260914002000_installation_config.sql");
    expect(CLEAN_CUSTOMER_MIGRATIONS).toContain("20260914004000_whitelabel_content_services.sql");
    expect(CLEAN_CUSTOMER_MIGRATIONS).not.toContain("20260601000300_producer_sales_seed.sql");
    expect(CLEAN_CUSTOMER_MIGRATIONS).not.toContain("20260601000400_producer_leaderboard_seed.sql");
    expect(CLEAN_CUSTOMER_MIGRATIONS).not.toContain("20260914001000_whitelabel_intake.sql");
    expect(CLEAN_CUSTOMER_MIGRATIONS).not.toContain("20260914003000_whitelabel_provisioning.sql");
    expect(CLEAN_CUSTOMER_MIGRATIONS.filter((name) => name.includes("gateway"))).toEqual([]);
  });

  it("puts the migration and its marker in one transaction", () => {
    const wrapped = migrationMarkerSql("migration.sql", "select 1;");
    expect(wrapped).toMatch(/^begin;/);
    expect(wrapped).toContain("select 1;");
    expect(wrapped).toContain("installation_schema_migration");
    expect(wrapped).toContain("values ('migration.sql') on conflict do nothing");
    expect(wrapped).toMatch(/commit;$/);
  });

  it("purges all inherited public data except installation config and the migration registry", () => {
    expect(CLEAN_CUSTOMER_DATA_SQL).toContain("truncate table");
    expect(CLEAN_CUSTOMER_DATA_SQL).toContain("'installation_config', 'installation_schema_migration'");
    expect(CLEAN_CUSTOMER_DATA_SQL).not.toContain("'installation_carrier_link'");
    expect(CLEAN_CUSTOMER_DATA_SQL).toContain(CLEANUP_MIGRATION_KEY);
  });

  it("does not smuggle the known pure demo seed files through another manifest entry", () => {
    for (const name of CLEAN_CUSTOMER_MIGRATIONS) {
      const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", name), "utf8");
      expect(name.includes("producer_sales_seed"), name).toBe(false);
      expect(name.includes("producer_leaderboard_seed"), name).toBe(false);
      expect(sql.length, name).toBeGreaterThan(0);
    }
  });
});
