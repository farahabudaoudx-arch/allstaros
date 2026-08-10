export type ScorecardExportFormat = "portrait" | "landscape";

export const SCORECARD_EXPORTS = {
  portrait: { width: 1080, height: 1920, label: "9:16" },
  landscape: { width: 1920, height: 1080, label: "16:9" },
} as const satisfies Record<
  ScorecardExportFormat,
  { width: number; height: number; label: string }
>;

export function scorecardExportFilename(
  sectionName: string,
  format: ScorecardExportFormat,
): string {
  const safeName = sectionName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${safeName || "scorecard"}-${SCORECARD_EXPORTS[format].label.replace(":", "x")}.png`;
}
