import { PageShell, SectionHeading } from "@/components/ui";
import { AllStarChat } from "@/components/AllStarChat";

export const metadata = {
  title: "All Star AI — All Star OS",
};

export default function AllStarAIPage() {
  return (
    <PageShell>
      <SectionHeading
        kicker="Trained on the All Star training library"
        title="All Star AI"
      />
      <AllStarChat />
    </PageShell>
  );
}
