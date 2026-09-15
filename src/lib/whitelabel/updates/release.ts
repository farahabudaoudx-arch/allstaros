import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CLEAN_CUSTOMER_MIGRATIONS } from "@/lib/whitelabel/provisioning/clean-schema";
import type { ReleaseMigrationSnapshot, ReleaseSnapshot } from "./types";

const EXACT_GIT_SHA = /^[0-9a-f]{40}$/i;
const KNOWN_INSTALL_ONLY_MARKERS = new Set(["__whitelabel_clean_customer_data_v1__"]);

const DESTRUCTIVE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "TRUNCATE", pattern: /\btruncate\b/i },
  { label: "DROP TABLE", pattern: /\bdrop\s+table\b/i },
  { label: "DROP COLUMN", pattern: /\bdrop\s+column\b/i },
  { label: "DELETE FROM", pattern: /\bdelete\s+from\b/i },
  { label: "table/column rename", pattern: /\balter\s+table\b[\s\S]{0,240}\brename\s+(?:column\s+)?/i },
  { label: "column type rewrite", pattern: /\balter\s+table\b[\s\S]{0,240}\balter\s+(?:column\s+)?[^;]{0,160}\btype\b/i },
];

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ");
}

export function exactSourceSha(value: string): string {
  const clean = value.trim().toLowerCase();
  if (!EXACT_GIT_SHA.test(clean)) throw new Error("Ticket 6 releases require the exact 40-character Git source SHA.");
  return clean;
}

export function currentRuntimeSourceSha(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.WHITELABEL_SOURCE_SHA?.trim() || env.VERCEL_GIT_COMMIT_SHA?.trim() || "";
  if (!value) throw new Error("The current runtime does not expose an exact source SHA.");
  return exactSourceSha(value);
}

export function migrationSchemaRelease(migrationName: string): string {
  if (!migrationName.endsWith(".sql")) throw new Error(`Invalid customer migration name: ${migrationName}`);
  return migrationName.slice(0, -4);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function assertIncrementalMigrationSafe(migration: Pick<ReleaseMigrationSnapshot, "migrationName" | "sql">): void {
  const normalized = stripSqlComments(migration.sql);
  const hit = DESTRUCTIVE_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  if (hit) {
    throw new Error(`Migration ${migration.migrationName} is not safe for managed in-place updates (${hit.label}).`);
  }
}

export async function createReleaseSnapshot(args: {
  sourceSha?: string;
  migrationRoot?: string;
} = {}): Promise<ReleaseSnapshot> {
  const runtimeSha = currentRuntimeSourceSha();
  const requestedSha = args.sourceSha ? exactSourceSha(args.sourceSha) : runtimeSha;
  if (!args.migrationRoot && requestedSha !== runtimeSha) {
    throw new Error("Release source SHA must match the exact source SHA running this Assembly Line instance.");
  }
  const sourceSha = requestedSha;
  const root = args.migrationRoot ?? path.join(process.cwd(), "supabase", "migrations");
  const migrations = await Promise.all(CLEAN_CUSTOMER_MIGRATIONS.map(async (migrationName, index) => {
    const sql = await readFile(path.join(root, migrationName), "utf8");
    return {
      ordinal: index + 1,
      migrationName,
      schemaRelease: migrationSchemaRelease(migrationName),
      sqlSha256: sha256(sql),
      sql,
    } satisfies ReleaseMigrationSnapshot;
  }));
  const last = migrations.at(-1);
  if (!last) throw new Error("Customer migration lineage is empty.");
  return { sourceSha, schemaRelease: last.schemaRelease, migrations };
}

export function buildMigrationPlan(args: {
  release: ReleaseSnapshot;
  installedSchemaRelease: string;
  actualMarkers?: readonly string[];
}): ReleaseMigrationSnapshot[] {
  const lineage = args.release.migrations;
  const installedIndex = lineage.findIndex((migration) => migration.schemaRelease === args.installedSchemaRelease);
  if (installedIndex < 0) {
    throw new Error(`Installed schema ${args.installedSchemaRelease} is outside the managed customer migration lineage.`);
  }
  const targetIndex = lineage.findIndex((migration) => migration.schemaRelease === args.release.schemaRelease);
  if (targetIndex < 0 || targetIndex !== lineage.length - 1) throw new Error("Release schema does not match its pinned migration lineage.");
  if (installedIndex > targetIndex) throw new Error("Installed schema is newer than the selected release.");

  if (args.actualMarkers) {
    const lineageNames = new Set(lineage.map((migration) => migration.migrationName));
    const actual = new Set(args.actualMarkers);
    const unknown = args.actualMarkers.filter((name) => !lineageNames.has(name) && !KNOWN_INSTALL_ONLY_MARKERS.has(name));
    if (unknown.length) throw new Error(`Customer database contains unknown migration markers: ${unknown.join(", ")}.`);
    const expectedApplied = lineage.slice(0, installedIndex + 1).map((migration) => migration.migrationName);
    const missing = expectedApplied.filter((name) => !actual.has(name));
    if (missing.length) throw new Error(`Customer database is missing expected migration markers: ${missing.join(", ")}.`);
    const ahead = lineage.slice(installedIndex + 1).filter((migration) => actual.has(migration.migrationName));
    if (ahead.length) throw new Error("Customer database markers are ahead of the recorded installed schema; compatibility verification is required.");
  }

  const pending = lineage.slice(installedIndex + 1);
  if (pending.length === 0) return [];
  for (const migration of pending) assertIncrementalMigrationSafe(migration);
  return pending;
}

export function remainingPinnedMigrations(args: {
  release: ReleaseSnapshot;
  installedSchemaRelease: string;
  actualMarkers: readonly string[];
}): ReleaseMigrationSnapshot[] {
  const lineage = args.release.migrations;
  const installedIndex = lineage.findIndex((migration) => migration.schemaRelease === args.installedSchemaRelease);
  if (installedIndex < 0) throw new Error(`Installed schema ${args.installedSchemaRelease} is outside the managed customer migration lineage.`);
  const actual = new Set(args.actualMarkers);
  const lineageNames = new Set(lineage.map((migration) => migration.migrationName));
  const unknown = args.actualMarkers.filter((name) => !lineageNames.has(name) && !KNOWN_INSTALL_ONLY_MARKERS.has(name));
  if (unknown.length) throw new Error(`Customer database contains unknown migration markers: ${unknown.join(", ")}.`);

  const base = lineage.slice(0, installedIndex + 1);
  const missingBase = base.filter((migration) => !actual.has(migration.migrationName));
  if (missingBase.length) throw new Error(`Customer database is missing expected migration markers: ${missingBase.map((row) => row.migrationName).join(", ")}.`);

  const pending = lineage.slice(installedIndex + 1);
  let appliedPrefix = 0;
  while (appliedPrefix < pending.length && actual.has(pending[appliedPrefix].migrationName)) appliedPrefix += 1;
  const outOfOrder = pending.slice(appliedPrefix + 1).filter((migration) => actual.has(migration.migrationName));
  if (outOfOrder.length) {
    throw new Error(`Customer database migration markers are non-contiguous: ${outOfOrder.map((row) => row.migrationName).join(", ")}.`);
  }
  const remaining = pending.slice(appliedPrefix);
  for (const migration of remaining) assertIncrementalMigrationSafe(migration);
  return remaining;
}

export function pinnedMigrationTransactionSql(migration: ReleaseMigrationSnapshot): string {
  const marker = migration.migrationName.replace(/'/g, "''");
  return `begin;\ncreate table if not exists public.installation_schema_migration (migration_name text primary key, applied_at timestamptz not null default now());\n${migration.sql}\ninsert into public.installation_schema_migration (migration_name) values ('${marker}') on conflict do nothing;\ncommit;`;
}

export const INSTALLATION_MIGRATION_MARKERS_SQL =
  "select migration_name from public.installation_schema_migration order by migration_name";
