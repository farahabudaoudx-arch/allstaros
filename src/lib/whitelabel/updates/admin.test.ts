import { describe, expect, it } from "vitest";
import { UPDATE_TABLES } from "./admin";

describe("Ticket 6 schema boundary", () => {
  it("uses the worker-1 control-plane table contract in one centralized module", () => {
    expect(UPDATE_TABLES).toEqual({
      installation: "whitelabel_installation",
      installationVersion: "whitelabel_installation_version",
      maintenanceEvent: "whitelabel_maintenance_event",
      installationEntitlement: "whitelabel_installation_entitlement",
      release: "whitelabel_release",
      releaseMigration: "whitelabel_release_migration",
      rollout: "whitelabel_rollout",
      rolloutEntitlement: "whitelabel_rollout_entitlement",
      updateAttempt: "whitelabel_update_attempt",
      recoveryPoint: "whitelabel_recovery_point",
      recoveryRun: "whitelabel_recovery_run",
    });
  });
});
