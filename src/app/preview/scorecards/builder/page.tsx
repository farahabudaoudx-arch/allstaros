import mayaFixture from "@/lib/scorecards/fixtures/maya-builder-demo.json";
import type { BuilderScorecardView } from "@/components/scorecards/BuilderScorecardPreview";
import { notFound } from "next/navigation";
import { BuilderScorecardPreview } from "@/components/scorecards/BuilderScorecardPreview";
import { loadLiveBuilderView } from "../_builder-data";

import { deterministicBuilderScorecardView } from "../_builder-data";

export default async function BuilderScorecardVisualPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();

  const params = await searchParams;
  const source = typeof params.source === "string" ? params.source : "fixture";
  const view: BuilderScorecardView = params.member === "maya"
    ? { member: mayaFixture.member, period: { kind: "monthly", label: mayaFixture.period.label, previousLabel: mayaFixture.period.previous.label }, metric: mayaFixture.metricPayload as BuilderScorecardView["metric"] }
    : source === "live"
    ? await loadLiveBuilderView()
    : deterministicBuilderScorecardView({
        longName: params.name === "long",
        initials: params.photo === "initials",
        negativeGrowth: params.scenario === "negative-growth",
      });

  return (
    <div className="min-h-dvh bg-background px-5 py-8 text-ink md:px-10 md:py-12">
      <main className="mx-auto w-full max-w-6xl">
        <BuilderScorecardPreview view={view} />
      </main>
    </div>
  );
}
