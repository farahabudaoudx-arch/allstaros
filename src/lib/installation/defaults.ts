import type { InstallationCarrierLink, InstallationConfig } from "./types";

export const ALL_STAR_INSTALLATION_DEFAULTS: InstallationConfig = {
  organizationName: "All Star Life Group",
  shortName: "All Star",
  productName: "All Star OS",
  metadataDescription: "Recruiting pipeline for life-insurance organizations.",
  timezone: "America/Chicago",
  brandPrimaryColor: "#C9A235",
  brandAccentColor: "#F6C945",
  logoUrl: "/logo.png",
  faviconUrl: "/favicon.ico",
  supportEmail: "nicholasverge@gmail.com",
  replyToEmail: "nicholasverge@gmail.com",
  licensingProviderName: "Xcel Solutions",
  licensingCode: "FFLALLSTAR-NGBNCR",
  licensingLoginUrl: "https://www.xcelsolutions.com/",
  licensingRequirementsUrl: "https://www.xcelsolutions.com/insurance-license/requirements",
  licensingApplicationUrl: "https://www.sircon.com",
  graduationPolicyCount: 8,
  graduationWindowDays: 28,
  stallPersistedLapseDays: 3,
  stallExamUnscheduledDays: 3,
  stallNoCheckinDays: 2,
  stallCheckinLapsedDays: 2,
};

export const ALL_STAR_CARRIER_LINKS: InstallationCarrierLink[] = [
  { key: "americo", companyKey: "americo", displayName: "Americo", portalUrl: "https://account.americoagent.com/Identity/Account/Login/?returnUrl=https%3a%2f%2ftools.americoagent.com%2f", sortOrder: 10, showInResources: true },
  { key: "ethos", companyKey: "ethos", displayName: "Ethos", portalUrl: "https://agents.ethoslife.com/login", sortOrder: 20, showInResources: true },
  { key: "mutual-of-omaha", companyKey: "mutual of omaha", displayName: "Mutual Of Omaha", portalUrl: "https://accounts.mutualofomaha.com/samlAuthnRequest", sortOrder: 30, showInResources: true },
  { key: "nlg", companyKey: "national life group", displayName: "NLG", portalUrl: "https://www.nationallife.com/agent", sortOrder: 40, showInResources: true },
  { key: "transamerica-express", companyKey: "transamerica", displayName: "Transamerica Express", portalUrl: "https://secure.transamerica.com/agenthome/#/", sortOrder: 50, showInResources: true },
  { key: "transamerica-immediate-solutions", companyKey: "transamerica", displayName: "Transamerica Immediate Solutions", portalUrl: "https://secure.transamerica.com/agenthome/#/", sortOrder: 60, showInResources: true },
  { key: "corebridge", companyKey: "corebridge", displayName: "Corebridge", portalUrl: "https://connext.corebridgefinancial.com/life/connext-portal/public/login", sortOrder: 70, showInResources: true },
  { key: "aetna", companyKey: "aetna", displayName: "Aetna", portalUrl: "https://www.aetna.com/producer_public/login.fcc?icid=OLogin_nav_link", sortOrder: 80, showInResources: true },
  { key: "american-amicable", companyKey: "american amicable", displayName: "American Amicable", portalUrl: "https://www.insuranceapplication.com/AppPage/index.html", sortOrder: 90, showInResources: true },
];
