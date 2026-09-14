import { afterEach, describe, expect, it } from "vitest";
import { getEmailBrand } from "./email-brand";

const original = { ...process.env };

afterEach(() => {
  for (const key of [
    "INSTALLATION_ORGANIZATION_NAME",
    "INSTALLATION_SHORT_NAME",
    "INSTALLATION_PRODUCT_NAME",
    "INSTALLATION_LOGO_URL",
    "INSTALLATION_BRAND_ACCENT",
    "INSTALLATION_BRAND_PRIMARY",
  ]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("email brand", () => {
  it("preserves current email branding by default", () => {
    delete process.env.INSTALLATION_ORGANIZATION_NAME;
    delete process.env.INSTALLATION_SHORT_NAME;
    delete process.env.INSTALLATION_PRODUCT_NAME;
    delete process.env.INSTALLATION_LOGO_URL;
    delete process.env.INSTALLATION_BRAND_ACCENT;
    delete process.env.INSTALLATION_BRAND_PRIMARY;
    expect(getEmailBrand()).toEqual({
      organizationName: "All Star Life Group",
      shortName: "All Star",
      productName: "All Star OS",
      logoUrl: "https://app.allstarlifegroup.com/logo.png",
      accentColor: "#F6C945",
      accentSoftColor: "#C9A235",
    });
  });

  it("uses deployment-provided customer branding", () => {
    process.env.INSTALLATION_ORGANIZATION_NAME = "Acme Agency";
    process.env.INSTALLATION_SHORT_NAME = "Acme";
    process.env.INSTALLATION_PRODUCT_NAME = "Acme OS";
    process.env.INSTALLATION_LOGO_URL = "https://assets.acme.test/logo.png";
    process.env.INSTALLATION_BRAND_ACCENT = "#112233";
    process.env.INSTALLATION_BRAND_PRIMARY = "#445566";
    expect(getEmailBrand()).toEqual({
      organizationName: "Acme Agency",
      shortName: "Acme",
      productName: "Acme OS",
      logoUrl: "https://assets.acme.test/logo.png",
      accentColor: "#112233",
      accentSoftColor: "#445566",
    });
  });
});
