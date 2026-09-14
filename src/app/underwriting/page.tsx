import { UnderwritingClient } from "./UnderwritingClient";
import { getInstallationCarrierLinks } from "@/lib/installation/config";

export default async function UnderwritingPage() {
  const rows = await getInstallationCarrierLinks();
  const carrierPortals = rows.map((row) => ({
    name: row.displayName,
    href: row.portalUrl,
    companyKey: row.companyKey,
  }));
  return <UnderwritingClient carrierPortals={carrierPortals} />;
}
