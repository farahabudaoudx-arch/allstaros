import { describe, expect, it } from "vitest";
import {
  PROVISIONING_STEPS,
  nextProvisioningStep,
  seedProvisioningSteps,
  type ProvisioningStepStatus,
} from "./plan";

describe("Whitelabel provisioning plan", () => {
  it("keeps a deterministic, resumable step order", () => {
    expect(PROVISIONING_STEPS).toEqual([
      "validate_intake",
      "verify_provider_access",
      "apply_clean_schema",
      "configure_installation",
      "configure_vercel_environment",
      "deploy_source",
      "configure_domain",
      "create_initial_admin",
      "smoke_check",
    ]);
    expect(seedProvisioningSteps().map((row) => row.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("resumes the first unfinished step instead of replaying completed work", () => {
    const rows = seedProvisioningSteps().map((row) => ({
      ...row,
      status: "pending" as ProvisioningStepStatus,
    }));
    rows[0].status = "succeeded";
    rows[1].status = "succeeded";
    rows[2].status = "failed";
    expect(nextProvisioningStep(rows)).toBe("apply_clean_schema");
    rows[2].status = "succeeded";
    expect(nextProvisioningStep(rows)).toBe("configure_installation");
  });
});
