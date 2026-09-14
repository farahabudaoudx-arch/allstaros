"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ALL_STAR_INSTALLATION_DEFAULTS } from "./defaults";
import type { InstallationBrand } from "./types";

const DEFAULT_BRAND: InstallationBrand = {
  organizationName: ALL_STAR_INSTALLATION_DEFAULTS.organizationName,
  shortName: ALL_STAR_INSTALLATION_DEFAULTS.shortName,
  productName: ALL_STAR_INSTALLATION_DEFAULTS.productName,
  brandPrimaryColor: ALL_STAR_INSTALLATION_DEFAULTS.brandPrimaryColor,
  brandAccentColor: ALL_STAR_INSTALLATION_DEFAULTS.brandAccentColor,
  logoUrl: ALL_STAR_INSTALLATION_DEFAULTS.logoUrl,
  faviconUrl: ALL_STAR_INSTALLATION_DEFAULTS.faviconUrl,
};

const InstallationBrandContext = createContext<InstallationBrand>(DEFAULT_BRAND);

export function InstallationBrandProvider({
  brand,
  children,
}: {
  brand: InstallationBrand;
  children: ReactNode;
}) {
  return (
    <InstallationBrandContext.Provider value={brand}>
      {children}
    </InstallationBrandContext.Provider>
  );
}

export function useInstallationBrand(): InstallationBrand {
  return useContext(InstallationBrandContext);
}
