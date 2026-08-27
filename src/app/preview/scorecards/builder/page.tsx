import { notFound } from "next/navigation";
import { BuilderScorecardPreview } from "@/components/scorecards/BuilderScorecardPreview";
import { loadLiveBuilderView } from "../_builder-data";

export default async function BuilderScorecardVisualPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const view = await loadLiveBuilderView();

  return (
    <div className="min-h-dvh bg-background px-5 py-8 text-ink md:px-10 md:py-12">
      <main className="mx-auto w-full max-w-6xl">
        <BuilderScorecardPreview view={view} />
      </main>
    </div>
  );
}
