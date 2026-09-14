import { InstallationBrandProvider } from "@/lib/installation/brand-context";
import { getInstallationBrand } from "@/lib/installation/config";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const brand = await getInstallationBrand();
  return <InstallationBrandProvider brand={brand}>{children}</InstallationBrandProvider>;
}
