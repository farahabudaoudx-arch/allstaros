import { BRAND, buttonRow, escapeHtml, fallbackRow, footerRow, headingRow, paragraphRow, shell } from "./_layout";
import { scorecardPeriodFromStart, type ScorecardPeriod } from "@/lib/scorecards/period";

export type ScorecardReadyDeliveryType = "producer_email" | "builder_email";

export type FrozenScorecardPeriod = Pick<ScorecardPeriod, "kind" | "start" | "end">;

export function frozenScorecardPeriod(period: FrozenScorecardPeriod): ScorecardPeriod {
  const canonical = scorecardPeriodFromStart(period.kind, period.start);
  if (canonical.end !== period.end) {
    throw new Error("Published Scorecard period is not an exact calendar period.");
  }
  return canonical;
}

export function scorecardReadySubject(period: FrozenScorecardPeriod): string {
  const canonical = frozenScorecardPeriod(period);
  if (canonical.kind === "monthly") {
    const month = new Intl.DateTimeFormat("en-US", {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${canonical.start}T00:00:00.000Z`));
    return `Your ${month} Scorecard Is Ready`;
  }
  if (canonical.kind === "quarterly") {
    return `Your ${canonical.label.split(" ")[0]} Scorecard Is Ready`;
  }
  return `Your ${canonical.label} Scorecard Is Ready`;
}

export function scorecardsUrl(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/$/, "")}/producer/scorecards`;
}

export function scorecardReadyEmail({
  period,
  deliveryType,
  appBaseUrl,
}: {
  period: FrozenScorecardPeriod;
  deliveryType: ScorecardReadyDeliveryType;
  appBaseUrl: string;
}): { subject: string; html: string; text: string; ctaUrl: string } {
  const canonical = frozenScorecardPeriod(period);
  const subject = scorecardReadySubject(period);
  const ctaUrl = scorecardsUrl(appBaseUrl);
  const cardName = deliveryType === "producer_email" ? "Producer" : "Builder";
  const periodLabel = escapeHtml(canonical.label);
  const body = `Your ${escapeHtml(cardName)} Scorecard for ${periodLabel} has been published and is ready in your Scorecards archive.`;

  return {
    subject,
    ctaUrl,
    html: shell({
      subject,
      preheader: `${canonical.label} Scorecard ready.`,
      rows: [
        headingRow(subject),
        paragraphRow(body),
        buttonRow("View My Scorecards", ctaUrl),
        fallbackRow(ctaUrl),
        footerRow(`Your published Scorecards remain available through your normal ${escapeHtml(BRAND.SHORT_NAME)} account access.`),
      ].join("\n"),
    }),
    text: [
      subject,
      "",
      `Your ${cardName} Scorecard for ${canonical.label} has been published and is ready in your Scorecards archive.`,
      "",
      "View My Scorecards:",
      ctaUrl,
      "",
      `Your published Scorecards remain available through your normal ${BRAND.SHORT_NAME} account access.`,
    ].join("\n"),
  };
}
