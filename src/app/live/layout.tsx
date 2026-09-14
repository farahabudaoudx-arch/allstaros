import { getInstallationBrand } from "@/lib/installation/config";
import { InstallationBrandProvider } from "@/lib/installation/brand-context";

export default async function LiveLayout({ children }: { children: React.ReactNode }) {
  const brand = await getInstallationBrand();
  return <InstallationBrandProvider brand={brand}>{children}</InstallationBrandProvider>;
}
