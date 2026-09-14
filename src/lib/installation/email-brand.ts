import { ALL_STAR_INSTALLATION_DEFAULTS } from "./defaults";

export type EmailBrand = {
  organizationName: string;
  shortName: string;
  productName: string;
  logoUrl: string;
  accentColor: string;
  accentSoftColor: string;
};

export function getEmailBrand(): EmailBrand {
  return {
    organizationName: process.env.INSTALLATION_ORGANIZATION_NAME?.trim() || ALL_STAR_INSTALLATION_DEFAULTS.organizationName,
    shortName: process.env.INSTALLATION_SHORT_NAME?.trim() || ALL_STAR_INSTALLATION_DEFAULTS.shortName,
    productName: process.env.INSTALLATION_PRODUCT_NAME?.trim() || ALL_STAR_INSTALLATION_DEFAULTS.productName,
    logoUrl: process.env.INSTALLATION_LOGO_URL?.trim() || "https://app.allstarlifegroup.com/logo.png",
    accentColor: process.env.INSTALLATION_BRAND_ACCENT?.trim() || ALL_STAR_INSTALLATION_DEFAULTS.brandAccentColor,
    accentSoftColor: process.env.INSTALLATION_BRAND_PRIMARY?.trim() || ALL_STAR_INSTALLATION_DEFAULTS.brandPrimaryColor,
  };
}
