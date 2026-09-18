import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "../../../config/whitelabel-customer-migrations.json";

const DEMO_SEEDS = new Set([
  "20260601000300_producer_sales_seed.sql",
  "20260601000400_producer_leaderboard_seed.sql",
]);

describe("customer Product migration manifest", () => {
  it("contains every runtime migration and no control-plane migration", () => {
    const migrationDir = path.join(process.cwd(), "supabase", "migrations");
    const runtimeMigrations = readdirSync(migrationDir)
      .filter((name) => name.endsWith(".sql") && !DEMO_SEEDS.has(name))
      .sort();

    expect([...manifest.customerMigrations].sort()).toEqual(runtimeMigrations);
    expect(manifest.customerMigrations.some((name) =>
      /whitelabel_(?:intake|provisioning|verification_handoff|updates_independent_operation)/i.test(name),
    )).toBe(false);
  });

  it("pins schemaRelease to the final customer migration", () => {
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.schemaRelease).toBe(
      manifest.customerMigrations.at(-1)?.replace(/\.sql$/, ""),
    );
  });

  it("keeps the runtime identity migration/config contract in Product", () => {
    const migrationDir = path.join(process.cwd(), "supabase", "migrations");
    for (const name of [
      "20260914002000_installation_config.sql",
      "20260914004000_whitelabel_content_services.sql",
    ]) {
      expect(readFileSync(path.join(migrationDir, name), "utf8").length).toBeGreaterThan(0);
      expect(manifest.customerMigrations).toContain(name);
    }
  });
});
