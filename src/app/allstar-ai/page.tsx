import { PageShell } from "@/components/ui";
import { PageHeader } from "@/components/producer/PageHeader";
import { AllStarChat } from "@/components/AllStarChat";

export const metadata = {
  title: "All Star Sidekick - All Star OS",
};

export default function AllStarAIPage() {
  return (
    <PageShell>
      <PageHeader title="All Star Sidekick" backHref="/producer/menu/resources" />
      <AllStarChat />
    </PageShell>
  );
}
