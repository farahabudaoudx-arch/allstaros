import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { inspectSourcePackageZip, sourcePackagePathAllowed } from "./source-package";

const manifest = {
  formatVersion: 1,
  sourceSha: "1247f2c2bbbbbb49223fe117f6006877390ab76a",
  schemaRelease: "20260914004000_whitelabel_content_services",
  customerMigrations: ["20260914004000_whitelabel_content_services.sql"],
  controlPlaneExcluded: true,
  secretScan: "passed",
};

function packageBytes(extra: Record<string, Uint8Array> = {}) {
  return zipSync({
    "WHITELABEL_SOURCE_MANIFEST.json": strToU8(JSON.stringify(manifest)),
    "src/app/page.tsx": strToU8("export default function Page(){return null}"),
    "supabase/migrations/20260914004000_whitelabel_content_services.sql": strToU8("select 1;"),
    ...extra,
  });
}

describe("source package handoff gate", () => {
  it("excludes environment, generated, control-plane paths", () => {
    expect(sourcePackagePathAllowed("src/app/page.tsx")).toBe(true);
    expect(sourcePackagePathAllowed(".env.production")).toBe(false);
    expect(sourcePackagePathAllowed("src/app/admin/os-builds/[id]/page.tsx")).toBe(false);
    expect(sourcePackagePathAllowed("src/app/admin/os-updates/page.tsx")).toBe(false);
    expect(sourcePackagePathAllowed("src/lib/actions/admin/os-updates.ts")).toBe(false);
    expect(sourcePackagePathAllowed("src/lib/whitelabel/provisioning/orchestrator.ts")).toBe(false);
    expect(sourcePackagePathAllowed("node_modules/pkg/index.js")).toBe(false);
    expect(sourcePackagePathAllowed(".agents/release-checklist.md")).toBe(false);
    expect(sourcePackagePathAllowed("AGENTS.md")).toBe(false);
    expect(sourcePackagePathAllowed("certs/customer.key")).toBe(false);
    expect(sourcePackagePathAllowed("config/service-account.prod.json")).toBe(false);
  });

  it("accepts a package whose manifest exactly matches customer migrations", () => {
    expect(inspectSourcePackageZip(packageBytes())).toMatchObject({ sourceSha: manifest.sourceSha, secretScan: "passed" });
  });

  it("rejects control-plane/Gateway migrations and literal credentials", () => {
    const badMigration = packageBytes({ "supabase/migrations/20260914005000_whitelabel_verification_handoff.sql": strToU8("select 1;") });
    expect(() => inspectSourcePackageZip(badMigration)).toThrow(/migrations do not match|control-plane/i);
    const ticketSixMigration = packageBytes({ "supabase/migrations/20260915001000_whitelabel_updates_independent_operation.sql": strToU8("select 1;") });
    expect(() => inspectSourcePackageZip(ticketSixMigration)).toThrow(/migrations do not match|control-plane/i);
    const secret = packageBytes({ "notes.txt": strToU8("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456") });
    expect(() => inspectSourcePackageZip(secret)).toThrow(/secret scan/i);
    const genericSecret = packageBytes({ "config.ts": strToU8('const apiKey = "abcdefghijklmnopqrstuvwx";') });
    expect(() => inspectSourcePackageZip(genericSecret)).toThrow(/secret scan/i);
  });

  it("allows obvious Bearer fixtures in tests without weakening high-confidence secret checks", () => {
    const fixture = packageBytes({ "src/example.test.ts": strToU8('const header = "Bearer runner-connect-token";') });
    expect(() => inspectSourcePackageZip(fixture)).not.toThrow();
    const jwt = packageBytes({ "src/example.test.ts": strToU8("eyJaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc") });
    expect(() => inspectSourcePackageZip(jwt)).toThrow(/secret scan/i);
  });
});
