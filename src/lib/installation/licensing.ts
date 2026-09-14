import type { InstallationConfig } from "./types";

export type EffectiveLicensingSettings = {
  providerName: string;
  code: string;
  loginUrl: string;
  requirementsUrl: string;
  applicationUrl: string;
};

export function effectiveLicensingSettings(
  installation: InstallationConfig,
  builderCode?: string | null,
): EffectiveLicensingSettings {
  return {
    providerName: installation.licensingProviderName,
    code: builderCode?.trim() || installation.licensingCode,
    loginUrl: installation.licensingLoginUrl,
    requirementsUrl: installation.licensingRequirementsUrl,
    applicationUrl: installation.licensingApplicationUrl,
  };
}
