import { ALL_STAR_CARRIER_LINKS } from "@/lib/installation/defaults";

export type CarrierPortal = { name: string; href: string; companyKey: string };

// Displayed as-is on the Portal Links page (one entry per agent-portal login).
export const CARRIER_PORTALS: CarrierPortal[] = ALL_STAR_CARRIER_LINKS.map((row) => ({
  name: row.displayName,
  href: row.portalUrl,
  companyKey: row.companyKey,
}));

// Map a wizard carrier label — formatted "Company (Product)" — to its portal
// URL, keyed on the company prefix (every product from one company shares the
// same agent portal). Returns null when we don't have a link for that company.
export function portalUrlForCarrier(
  carrier: string,
  portals: readonly CarrierPortal[] = CARRIER_PORTALS,
): string | null {
  const company = carrier.split("(")[0].trim().toLowerCase();
  return portals.find((portal) => portal.companyKey.trim().toLowerCase() === company)?.href ?? null;
}
