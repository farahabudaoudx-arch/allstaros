export type InstallationConfig = {
  organizationName: string;
  shortName: string;
  productName: string;
  metadataDescription: string;
  timezone: string;
  brandPrimaryColor: string;
  brandAccentColor: string;
  logoUrl: string;
  faviconUrl: string;
  supportEmail: string;
  replyToEmail: string;
  licensingProviderName: string;
  licensingCode: string;
  licensingLoginUrl: string;
  licensingRequirementsUrl: string;
  licensingApplicationUrl: string;
  graduationPolicyCount: number;
  graduationWindowDays: number;
  stallPersistedLapseDays: number;
  stallExamUnscheduledDays: number;
  stallNoCheckinDays: number;
  stallCheckinLapsedDays: number;
};

export type InstallationBrand = Pick<
  InstallationConfig,
  "organizationName" | "shortName" | "productName" | "brandPrimaryColor" | "brandAccentColor" | "logoUrl" | "faviconUrl"
>;

export type InstallationCarrierLink = {
  key: string;
  companyKey: string;
  displayName: string;
  portalUrl: string;
  sortOrder: number;
  showInResources: boolean;
};
