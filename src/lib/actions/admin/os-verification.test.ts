import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "src", "lib", "actions", "admin", "os-verification.ts"), "utf8");

describe("Ticket 5 admin action contracts", () => {
  it("authorizes before constructing service-role control-plane work", () => {
    const starts = [...source.matchAll(/export async function (admin\w+)\([^]*?\n\}/g)];
    expect(starts.length).toBeGreaterThanOrEqual(6);
    for (const match of starts) {
      const body = match[0];
      const guard = body.indexOf("requireAdmin(");
      const serviceRole = body.indexOf("createServiceRoleClient(");
      expect(guard, match[1]).toBeGreaterThan(-1);
      if (serviceRole >= 0) expect(guard, match[1]).toBeLessThan(serviceRole);
    }
  });

  it("does not put credential references or provider secrets into the handoff snapshot", () => {
    const handoffSection = source.slice(source.indexOf("export async function adminRecordOsBuildHandoff"), source.indexOf("function artifactKind"));
    expect(handoffSection).not.toContain("credential_secret_id");
    expect(handoffSection).not.toContain("access_token");
    expect(handoffSection).not.toContain("api_key");
    expect(handoffSection).toContain("assertNoSecretLikeValue(JSON.stringify(safeConfig)");
  });

  it("keeps large source-package upload out of the Vercel action path", () => {
    expect(source).toContain("Source packages are built, secret-scanned, and uploaded with the offline handoff packaging script");
    expect(source).not.toContain("inspectSourcePackageZip(bytes)");
    expect(source).toContain("createHash(\"sha256\")");
  });

  it("can refresh automated checks without changing manual evidence", () => {
    const refreshSection = source.slice(source.indexOf("export async function adminRefreshOsBuildAutomatedVerification"), source.indexOf("export async function adminSaveOsVerificationItem"));
    expect(refreshSection).toContain('.eq("mode", "automated")');
    expect(refreshSection).toContain("verifyLiveInstallationVersion");
    expect(refreshSection).not.toContain('.eq("mode", "manual")');
  });

  it("rethrows Next redirect control-flow before translating action failures", () => {
    const failSection = source.slice(source.indexOf("function fail("), source.indexOf("function done("));
    const rethrow = failSection.indexOf("unstable_rethrow(error);");
    const errorRedirect = failSection.indexOf("redirect(`${path}?error=");
    expect(source).toContain('import { redirect, unstable_rethrow } from "next/navigation";');
    expect(rethrow).toBeGreaterThan(-1);
    expect(rethrow).toBeLessThan(errorRedirect);

    const catches = source.match(/catch \(error\) \{\s*fail\(path, error\);\s*\}/g) ?? [];
    expect(catches).toHaveLength(8);
  });
});
