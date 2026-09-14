import { describe, expect, it } from "vitest";
import { ALL_STAR_INSTALLATION_DEFAULTS } from "./defaults";
import { effectiveLicensingSettings } from "./licensing";

describe("effective licensing settings", () => {
  it("keeps the installation default code when the builder has no override", () => {
    expect(effectiveLicensingSettings(ALL_STAR_INSTALLATION_DEFAULTS, null)).toMatchObject({
      providerName: "Xcel Solutions",
      code: "FFLALLSTAR-NGBNCR",
      applicationUrl: "https://www.sircon.com",
    });
  });

  it("preserves the existing per-builder xcel code as the highest-precedence override", () => {
    expect(effectiveLicensingSettings(ALL_STAR_INSTALLATION_DEFAULTS, "  BUILDER-CODE  ").code)
      .toBe("BUILDER-CODE");
  });
});
