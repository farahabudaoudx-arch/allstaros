import Link from "next/link";
import { PageShell, SectionHeading } from "@/components/ui";
import { AllStarChat } from "@/components/AllStarChat";

export const metadata = {
  title: "All Star Sidekick — All Star OS",
};

export default function AllStarAIPage() {
  return (
    <PageShell>
      <Link
        href="/producer/resources"
        className="mb-6 inline-flex w-fit items-center gap-1.5 rounded-full border border-hairline bg-card px-3.5 py-1.5 text-xs font-medium text-subtle transition hover:border-accent hover:text-ink"
      >
        ← Resources
      </Link>
      <SectionHeading
        kicker="Trained on the All Star training library"
        title="All Star Sidekick"
      />
      <AllStarChat />
    </PageShell>
  );
}
