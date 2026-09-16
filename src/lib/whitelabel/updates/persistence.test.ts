import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  actualForwardSchemaRelease,
  releaseMigrationSnapshotFromRow,
} from "./persistence";
import { sha256 } from "./release";
import type { ReleaseSnapshot } from "./types";

const persistenceSource = readFileSync(
  path.join(process.cwd(), "src", "lib", "whitelabel", "updates", "persistence.ts"),
  "utf8",
);

describe("Ticket 6 update persistence", () => {
  it("loads immutable pinned migration SQL only when its persisted digest matches", () => {
    const sql = "create table if not exists public.ticket6_probe(id uuid primary key);";
    expect(releaseMigrationSnapshotFromRow({
      ordinal: 3,
      migration_name: "20260915009999_ticket6_probe.sql",
      schema_release: "20260915009999_ticket6_probe",
      migration_sql: sql,
      sha256: sha256(sql),
    })).toMatchObject({
      ordinal: 3,
      migrationName: "20260915009999_ticket6_probe.sql",
      schemaRelease: "20260915009999_ticket6_probe",
      sql,
    });

    expect(() => releaseMigrationSnapshotFromRow({
      ordinal: 3,
      migration_name: "20260915009999_ticket6_probe.sql",
      schema_release: "20260915009999_ticket6_probe",
      migration_sql: `${sql}\nselect 1;`,
      sha256: sha256(sql),
    })).toThrow(/digest mismatch/i);
  });

  it("derives recovery schema from the contiguous pinned migration prefix", () => {
    const release: ReleaseSnapshot = {
      sourceSha: "a".repeat(40),
      schemaRelease: "schema-3",
      migrations: [
        { ordinal: 1, migrationName: "one.sql", schemaRelease: "schema-1", sqlSha256: sha256("one"), sql: "one" },
        { ordinal: 2, migrationName: "two.sql", schemaRelease: "schema-2", sqlSha256: sha256("two"), sql: "two" },
        { ordinal: 3, migrationName: "three.sql", schemaRelease: "schema-3", sqlSha256: sha256("three"), sql: "three" },
      ],
    };
    expect(actualForwardSchemaRelease({ release, priorSchemaRelease: "schema-1", actualMigrationNames: ["one.sql", "two.sql"] })).toBe("schema-2");
    expect(actualForwardSchemaRelease({ release, priorSchemaRelease: "schema-1", actualMigrationNames: ["one.sql"] })).toBe("schema-1");
    expect(() => actualForwardSchemaRelease({ release, priorSchemaRelease: "schema-1", actualMigrationNames: ["one.sql", "unknown.sql"] })).toThrow(/unknown customer migration/i);
  });

  it("keeps provider credentials in the secure RPC and never imports clean-reset provisioning", () => {
    expect(persistenceSource).toContain('admin.rpc("get_whitelabel_service_credential"');
    expect(persistenceSource).toContain('from("whitelabel_release_migration")');
    expect(persistenceSource).toContain("migration_sql");
    expect(persistenceSource).toContain('from("whitelabel_installation_entitlement")');
    expect(persistenceSource).toContain('admin.rpc("record_whitelabel_recovery_version"');
    expect(persistenceSource).not.toContain("CLEAN_CUSTOMER_DATA_SQL");
    expect(persistenceSource).not.toContain("provisioning/orchestrator");
  });

  it("calls the recovery-version RPC with its current build/install/actor contract", () => {
    const start = persistenceSource.indexOf('admin.rpc("record_whitelabel_recovery_version"');
    expect(start).toBeGreaterThan(-1);
    const call = persistenceSource.slice(start, start + 900);
    expect(call).toContain("p_build_id: buildId");
    expect(call).toContain("p_installation_id:");
    expect(call).toContain("p_actor_id: actorId");
    expect(call).toContain("p_recovery_run_id: input.recoveryRunId");
    expect(call).not.toContain("p_update_attempt_id:");
  });

  it("returns the exact operations view contract expected by the Ticket 6 admin UI", () => {
    for (const key of [
      "available",
      "installation",
      "currentVersion",
      "versions",
      "maintenanceEvents",
      "entitlements",
      "rollouts",
      "releases",
      "activeRollout",
    ]) {
      expect(persistenceSource).toContain(`${key}:`);
    }
    expect(persistenceSource).toContain("export async function loadOperationsForAdmin");
    expect(persistenceSource).toContain("export async function loadReleasesForAdmin");
  });
});
