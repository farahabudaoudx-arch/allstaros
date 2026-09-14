import { PageShell } from "@/components/ui";
import { PageHeader } from "@/components/producer/PageHeader";
import { AllStarChat } from "@/components/AllStarChat";
import { getInstallationBrand } from "@/lib/installation/config";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getInstallationBrand();
  return { title: `${brand.shortName} Sidekick - ${brand.productName}` };
}

export default async function AllStarAIPage() {
  const brand = await getInstallationBrand();
  return (
    <PageShell>
      <PageHeader title={`${brand.shortName} Sidekick`} backHref="/producer/menu/resources" />
      <AllStarChat />
    </PageShell>
  );
}
