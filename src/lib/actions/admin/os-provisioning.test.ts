import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const actionSource = readFileSync(
  path.join(process.cwd(), "src", "lib", "actions", "admin", "os-provisioning.ts"),
  "utf8",
);
const panelSource = readFileSync(
  path.join(process.cwd(), "src", "components", "admin", "os-builds", "ProvisioningPanel.tsx"),
  "utf8",
);
const buildScript = readFileSync(path.join(process.cwd(), "scripts", "whitelabel-local-demo-build.mjs"), "utf8");
const startScript = readFileSync(path.join(process.cwd(), "scripts", "whitelabel-local-demo-start.mjs"), "utf8");

describe("OS provisioning admin flow", () => {
  it("auto-advances both new and resumed provisioning until the orchestrator pauses", () => {
    expect(actionSource).toContain("executeProvisioningUntilPaused");
    expect(actionSource.match(/executeProvisioningUntilPaused\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(actionSource).not.toContain("executeNextProvisioningStep");
  });

  it("keeps success redirects outside the error-catching blocks", () => {
    for (const marker of ["provisioning-started", "provisioning-advanced"]) {
      const redirectIndex = actionSource.indexOf(`?ok=${marker}`);
      const catchIndex = actionSource.lastIndexOf("} catch", redirectIndex);
      const catchCloseIndex = actionSource.indexOf("\n  }", catchIndex + 1);
      expect(redirectIndex, marker).toBeGreaterThan(catchCloseIndex);
    }
  });

  it("describes provisioning as one-click auto progression", () => {
    expect(panelSource).toContain("Retry provisioning");
    expect(panelSource).toContain("continues automatically through every runnable step");
    expect(panelSource).not.toContain("Run / retry next step");
  });

  it("forces the local demo onto local-pilot provider adapters", () => {
    expect(buildScript).toContain('WHITELABEL_LOCAL_PILOT: "1"');
    expect(startScript).toContain('WHITELABEL_LOCAL_PILOT: "1"');
  });
});
