import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assertIncrementalMigrationSafe,
  buildMigrationPlan,
  createReleaseSnapshot,
  pinnedMigrationTransactionSql,
  remainingPinnedMigrations,
  sha256,
} from "./release";
import type { ReleaseMigrationSnapshot, ReleaseSnapshot } from "./types";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function migration(ordinal: number, name: string, sql: string): ReleaseMigrationSnapshot {
  return {
    ordinal,
    migrationName: name,
    schemaRelease: name.slice(0, -4),
    sqlSha256: sha256(sql),
    sql,
  };
}

function release(...migrations: ReleaseMigrationSnapshot[]): ReleaseSnapshot {
  return { sourceSha: SHA_B, schemaRelease: migrations.at(-1)!.schemaRelease, migrations };
}

describe("Ticket 6 release lineage", () => {
  it("pins the requested exact source only when an explicit migration root makes the override test-only", async () => {
    const previous = process.env.VERCEL_GIT_COMMIT_SHA;
    const previousWhitelabel = process.env.WHITELABEL_SOURCE_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = SHA_A;
    delete process.env.WHITELABEL_SOURCE_SHA;
    try {
      await expect(createReleaseSnapshot({ sourceSha: SHA_B })).rejects.toThrow(/must match the exact source SHA/i);
      const snapshot = await createReleaseSnapshot({
        sourceSha: SHA_B,
        migrationRoot: path.join(process.cwd(), "supabase", "migrations"),
      });
      expect(snapshot.sourceSha).toBe(SHA_B);
      expect(snapshot.migrations.length).toBeGreaterThan(10);
      expect(snapshot.migrations.every((row) => row.sqlSha256 === sha256(row.sql))).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
      else process.env.VERCEL_GIT_COMMIT_SHA = previous;
      if (previousWhitelabel === undefined) delete process.env.WHITELABEL_SOURCE_SHA;
      else process.env.WHITELABEL_SOURCE_SHA = previousWhitelabel;
    }
  });

  it("rejects unknown installed lineage and destructive new migrations, while allowing no-op current releases", () => {
    const base = migration(1, "20260915000100_base.sql", "create table if not exists public.safe_table(id uuid primary key);");
    const destructive = migration(2, "20260915000200_bad.sql", "truncate table public.safe_table;");
    const snapshot = release(base, destructive);

    expect(() => buildMigrationPlan({ release: snapshot, installedSchemaRelease: "unknown" })).toThrow(/outside the managed/i);
    expect(() => buildMigrationPlan({ release: snapshot, installedSchemaRelease: base.schemaRelease })).toThrow(/not safe/i);
    expect(buildMigrationPlan({ release: snapshot, installedSchemaRelease: destructive.schemaRelease })).toEqual([]);
    expect(() => assertIncrementalMigrationSafe({ migrationName: "drop.sql", sql: "alter table x drop column y" })).toThrow(/DROP COLUMN/i);
  });

  it("requires exact marker history at preflight and resumes only a contiguous target prefix", () => {
    const one = migration(1, "20260915000100_one.sql", "select 1;");
    const two = migration(2, "20260915000200_two.sql", "select 2;");
    const three = migration(3, "20260915000300_three.sql", "select 3;");
    const snapshot = release(one, two, three);

    expect(buildMigrationPlan({ release: snapshot, installedSchemaRelease: one.schemaRelease, actualMarkers: [one.migrationName] })).toEqual([two, three]);
    expect(() => buildMigrationPlan({ release: snapshot, installedSchemaRelease: one.schemaRelease, actualMarkers: [one.migrationName, two.migrationName] })).toThrow(/ahead/i);
    expect(remainingPinnedMigrations({ release: snapshot, installedSchemaRelease: one.schemaRelease, actualMarkers: [one.migrationName, two.migrationName] })).toEqual([three]);
    expect(() => remainingPinnedMigrations({ release: snapshot, installedSchemaRelease: one.schemaRelease, actualMarkers: [one.migrationName, three.migrationName] })).toThrow(/non-contiguous/i);
    expect(() => remainingPinnedMigrations({ release: snapshot, installedSchemaRelease: one.schemaRelease, actualMarkers: [one.migrationName, "custom.sql"] })).toThrow(/unknown migration markers/i);
  });

  it("wraps one pinned migration and its marker transactionally without clean/reset SQL", () => {
    const row = migration(2, "20260915000200_two.sql", "alter table public.safe_table add column if not exists note text;");
    const sql = pinnedMigrationTransactionSql(row);
    expect(sql).toMatch(/^begin;/);
    expect(sql).toContain(row.sql);
    expect(sql).toContain("installation_schema_migration");
    expect(sql).toContain(row.migrationName);
    expect(sql).toMatch(/commit;$/);
    expect(sql).not.toMatch(/\btruncate\b|\bdelete\s+from\b/i);
  });
});
