import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "src", "lib", "actions", "admin", "os-updates.ts"), "utf8");

function actionSource(name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

describe("Ticket 6 admin update actions", () => {
  it("authorizes every public admin action before constructing the update persistence port", () => {
    const actions = [...source.matchAll(/export async function (admin\w+)\([^]*?\n\}/g)];
    expect(actions.length).toBeGreaterThanOrEqual(10);
    for (const match of actions) {
      const body = match[0];
      const guard = body.indexOf("requireAdmin(");
      const delegatesToGuardedReleaseTransition = body.includes("transitionReleaseAction(");
      expect(guard >= 0 || delegatesToGuardedReleaseTransition, match[1]).toBe(true);
      const port = body.indexOf("createUpdateAdminPort(");
      if (port >= 0) expect(guard, match[1]).toBeLessThan(port);
    }
    const transitionHelper = source.slice(source.indexOf("async function transitionReleaseAction"));
    expect(transitionHelper.indexOf("requireAdmin(")).toBeGreaterThan(-1);
    expect(transitionHelper.indexOf("requireAdmin(")).toBeLessThan(transitionHelper.indexOf("transitionReleaseForAdmin("));
  });

  it("covers release lifecycle, scheduling, update verification, compatibility rejoin, and recovery", () => {
    expect(source).toContain("createReleaseSnapshot()");
    expect(source).toContain("createReleaseForAdmin");
    expect(source).toContain("adminMarkOsReleaseReady");
    expect(source).toContain("adminResumeOsRelease");
    expect(source).toContain('transitionReleaseAction(formData, "running", "whitelabel.release.resume"');
    expect(source).toContain("adminCompleteOsRelease");
    expect(source).toContain('transitionReleaseAction(formData, "completed", "whitelabel.release.complete"');
    expect(source).toContain("adminWithdrawOsRelease");
    expect(source).toContain("scheduleUpdateForAdmin");
    expect(source).toContain("syncInstallationEntitlementsForAdmin");
    expect(source).toContain("adminSyncOsEntitlements");
    expect(source).toContain("executeNextUpdateStep");
    expect(source).toContain("finalizeOperationalVerificationForAdmin");
    expect(source).toContain("finalizeVerifiedUpdate");
    expect(source).toContain("buildCompatibilityVerification");
    expect(source).toContain("completeRejoinForAdmin");
    expect(source).toContain("executeRecovery");
  });

  it("validates UUID form identifiers and audits only safe lifecycle metadata", () => {
    expect(source).toContain("isUuid(value)");
    expect(source).toContain("writeAudit(");
    expect(source).not.toMatch(/access_token|service_role_key|supabaseToken|vercelToken/);
  });

  it("does not add email or cron execution to Ticket 6 admin actions", () => {
    expect(source).not.toMatch(/resend|sendEmail|cron_secret|scheduleCron/i);
  });

  it("keeps Operations, Independent, Rejoin, Update, and Recovery success redirects outside catches", () => {
    const lifecycleActions = [
      "adminBootstrapOsOperations",
      "adminTransitionOsMaintenance",
      "adminEnterOsIndependentOperation",
      "adminBeginOsCompatibilityRejoin",
      "adminSyncOsEntitlements",
      "adminScheduleOsUpdate",
      "adminAdvanceOsUpdate",
      "adminStartOsRecovery",
    ];

    for (const name of lifecycleActions) {
      const body = actionSource(name);
      const tryIndex = body.indexOf("try {");
      const catchIndex = body.lastIndexOf("} catch (error) {");
      const successRedirectIndex = body.lastIndexOf("done(");
      const guardIndex = body.indexOf("requireAdmin(");

      expect(guardIndex, `${name}: admin guard`).toBeGreaterThanOrEqual(0);
      expect(guardIndex, `${name}: guard before try`).toBeLessThan(tryIndex);
      expect(catchIndex, `${name}: catch`).toBeGreaterThan(tryIndex);
      expect(successRedirectIndex, `${name}: success redirect`).toBeGreaterThan(catchIndex);
      expect(body.slice(tryIndex, catchIndex), `${name}: redirect inside try`).not.toContain("done(");
    }
  });
});
