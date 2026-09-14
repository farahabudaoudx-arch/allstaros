"use client";

import { useInstallationBrand } from "@/lib/installation/brand-context";

export function InstallationLogo({ className }: { className?: string }) {
  const brand = useInstallationBrand();
  return (
    // Customer logos may use a customer-owned storage/domain, so do not restrict
    // them to the static Next Image remote-host allowlist.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand.logoUrl}
      alt={brand.productName}
      className={className ?? "app-logo h-10 w-auto"}
    />
  );
}
