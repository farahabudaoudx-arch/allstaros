import { describe, expect, it } from "vitest";
import { CARRIER_PORTALS, portalUrlForCarrier } from "./carrier-portals";

describe("installation carrier portals", () => {
  it("keeps current carrier resolution including National Life", () => {
    expect(portalUrlForCarrier("National Life Group (RapidProtect)"))
      .toBe("https://www.nationallife.com/agent");
    expect(portalUrlForCarrier("Transamerica (Immediate Solutions)"))
      .toBe("https://secure.transamerica.com/agenthome/#/");
  });

  it("resolves from the customer-provided portal collection", () => {
    expect(portalUrlForCarrier("Acme Life (Term)", [
      { name: "Acme", companyKey: "acme life", href: "https://portal.acme.test" },
    ])).toBe("https://portal.acme.test");
    expect(portalUrlForCarrier("Americo (FEX)", [])).toBeNull();
  });

  it("derives the default list from the installation fallback catalog", () => {
    expect(CARRIER_PORTALS).toHaveLength(9);
  });
});
