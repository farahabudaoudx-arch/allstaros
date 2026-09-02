import type { MonthlyProducerPreview, ProducerOverview } from "@/lib/scorecards/lifecycle";
import type { BuilderScorecardMetric } from "@/components/scorecards/BuilderScorecardPreview";
import type { ScorecardPeriodKind } from "@/lib/scorecards/run";

export type ScorecardSnapshotRow = {
  id: string;
  card_type: "producer" | "builder";
  period_kind: ScorecardPeriodKind;
  period_start: string;
  period_end: string;
  kpi_results: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function isScorecardSnapshotUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function producerScorecardPayload(
  value: unknown,
): { preview: MonthlyProducerPreview; overview: ProducerOverview } | null {
  if (!isRecord(value) || !isRecord(value.preview) || !isRecord(value.overview)) return null;
  return value as { preview: MonthlyProducerPreview; overview: ProducerOverview };
}

export function builderScorecardPayload(value: unknown): BuilderScorecardMetric | null {
  if (!isRecord(value)) return null;
  if (typeof value.teamIpCents !== "number" || typeof value.activeWriters !== "number") return null;
  if (!isRecord(value.growth) || !Array.isArray(value.trend) || !isRecord(value.recruitingRank)) return null;
  return value as BuilderScorecardMetric;
}
