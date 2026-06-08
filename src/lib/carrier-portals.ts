// Carrier agent-portal login links. Single source of truth shared by the
// Resources → Portal Links page and the Underwriting Wizard's carrier tiles,
// so the two never drift apart.

export type CarrierPortal = { name: string; href: string };

// Displayed as-is on the Portal Links page (one entry per agent-portal login).
export const CARRIER_PORTALS: CarrierPortal[] = [
  { name: "Americo", href: "https://account.americoagent.com/Identity/Account/Login/?returnUrl=https%3a%2f%2ftools.americoagent.com%2f" },
  { name: "Ethos", href: "https://agents.ethoslife.com/login" },
  { name: "Mutual Of Omaha", href: "https://accounts.mutualofomaha.com/samlAuthnRequest" },
  { name: "NLG", href: "https://www.nationallife.com/agent" },
  // Single Transamerica agent home serves both product lines.
  { name: "Transamerica Express", href: "https://secure.transamerica.com/agenthome/#/" },
  { name: "Transamerica Immediate Solutions", href: "https://secure.transamerica.com/agenthome/#/" },
  { name: "Corebridge", href: "https://connext.corebridgefinancial.com/life/connext-portal/public/login" },
  { name: "Aetna", href: "https://www.aetna.com/producer_public/login.fcc?icid=OLogin_nav_link" },
  { name: "American Amicable", href: "https://www.insuranceapplication.com/AppPage/index.html" },
];

// Map a wizard carrier label — formatted "Company (Product)" — to its portal
// URL, keyed on the company prefix (every product from one company shares the
// same agent portal). Returns null when we don't have a link for that company.
const COMPANY_PORTAL: Record<string, string> = {
  "american amicable": "https://www.insuranceapplication.com/AppPage/index.html",
  "americo": "https://account.americoagent.com/Identity/Account/Login/?returnUrl=https%3a%2f%2ftools.americoagent.com%2f",
  "corebridge": "https://connext.corebridgefinancial.com/life/connext-portal/public/login",
  "ethos": "https://agents.ethoslife.com/login",
  "mutual of omaha": "https://accounts.mutualofomaha.com/samlAuthnRequest",
  "transamerica": "https://secure.transamerica.com/agenthome/#/",
};

export function portalUrlForCarrier(carrier: string): string | null {
  const company = carrier.split("(")[0].trim().toLowerCase();
  return COMPANY_PORTAL[company] ?? null;
}
