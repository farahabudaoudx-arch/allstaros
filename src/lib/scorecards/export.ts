export type ScorecardExportFormat = "portrait" | "landscape";

export const SCORECARD_EXPORTS = {
  portrait: { width: 1080, height: 1920, label: "9:16" },
  landscape: { width: 1920, height: 1080, label: "16:9" },
} as const satisfies Record<
  ScorecardExportFormat,
  { width: number; height: number; label: string }
>;

type ProducerCardFaceLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const PRODUCER_CARD_EXPORT_LAYOUT = {
  portrait: {
    front: { left: 128, top: 195, width: 563, height: 788 },
    back: { left: 400, top: 968, width: 544, height: 762 },
  },
  landscape: {
    front: { left: 518, top: 54, width: 438, height: 613 },
    back: { left: 905, top: 400, width: 450, height: 630 },
  },
} as const satisfies Record<
  ScorecardExportFormat,
  { front: ProducerCardFaceLayout; back: ProducerCardFaceLayout }
>;

export function scorecardExportFilename(
  metadata: {
    cardType: "producer" | "builder";
    memberName: string;
    periodLabel: string;
    sectionName: string;
  },
  format: ScorecardExportFormat,
): string {
  const safeName = [
    metadata.memberName,
    metadata.periodLabel,
    `${metadata.cardType} scorecard`,
    metadata.sectionName,
  ].join(" ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${safeName || "scorecard"}-${SCORECARD_EXPORTS[format].label.replace(":", "x")}.png`;
}
