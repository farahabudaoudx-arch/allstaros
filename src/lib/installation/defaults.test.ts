import { describe, expect, it } from "vitest";
import { ALL_STAR_CARRIER_LINKS, ALL_STAR_INSTALLATION_DEFAULTS } from "./defaults";

describe("installation defaults", () => {
  it("preserves current All Star behavior when no customer override exists", () => {
    expect(ALL_STAR_INSTALLATION_DEFAULTS).toMatchObject({
      organizationName: "All Star Life Group",
      shortName: "All Star",
      productName: "All Star OS",
      timezone: "America/Chicago",
      brandPrimaryColor: "#C9A235",
      brandAccentColor: "#F6C945",
      logoUrl: "/logo.png",
      faviconUrl: "/favicon.ico",
      licensingCode: "FFLALLSTAR-NGBNCR",
      graduationPolicyCount: 8,
      graduationWindowDays: 28,
      stallPersistedLapseDays: 3,
      stallExamUnscheduledDays: 3,
      stallNoCheckinDays: 2,
      stallCheckinLapsedDays: 2,
    });
  });

  it("keeps the current carrier catalog as the installation fallback", () => {
    expect(ALL_STAR_CARRIER_LINKS).toHaveLength(9);
    expect(ALL_STAR_CARRIER_LINKS.find((row) => row.companyKey === "national life group")).toMatchObject({
      displayName: "NLG",
      portalUrl: "https://www.nationallife.com/agent",
    });
    expect(ALL_STAR_CARRIER_LINKS.filter((row) => row.companyKey === "transamerica")).toHaveLength(2);
  });
});
