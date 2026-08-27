import { buttonRow, escapeHtml, footerRow, headingRow, paragraphRow, shell } from "@/lib/emails/_layout";
import type { ScorecardDeliveryIntent } from "./run";

export type ScorecardPublicationMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type ScorecardDeliveryResult = {
  snapshotId: string;
  status: "sent" | "failed" | "missing_recipient";
  providerMessageId: string | null;
  error: string | null;
  retryable: boolean;
};

function publicationMessage(
  intent: ScorecardDeliveryIntent & { recipientEmail: string },
  archiveBaseUrl: string,
): ScorecardPublicationMessage {
  const cardName = intent.deliveryType === "producer_email" ? "Producer" : "Builder";
  const subject = `Your ${cardName} Scorecard is ready`;
  const url = `${archiveBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(intent.snapshotId)}`;
  const intro = `Your validated ${escapeHtml(cardName)} Scorecard has been published as a separate, frozen report.`;
  return {
    to: intent.recipientEmail,
    subject,
    idempotencyKey: intent.idempotencyKey,
    html: shell({
      subject,
      preheader: `Open your published ${cardName} Scorecard.`,
      rows: [
        headingRow(subject),
        paragraphRow(intro),
        buttonRow(`Open ${cardName} Scorecard`, url),
        footerRow("This report is preserved in your Scorecards archive."),
      ].join("\n"),
    }),
    text: [subject, "", `Your validated ${cardName} Scorecard has been published as a separate, frozen report.`, "", `Open it: ${url}`].join("\n"),
  };
}

export async function deliverScorecardPublications({
  intents,
  archiveBaseUrl,
  send,
}: {
  intents: ScorecardDeliveryIntent[];
  archiveBaseUrl: string;
  send: (message: ScorecardPublicationMessage) => Promise<{ messageId: string }>;
}): Promise<ScorecardDeliveryResult[]> {
  const results: ScorecardDeliveryResult[] = [];

  for (const intent of intents) {
    if (!intent.recipientEmail) {
      results.push({
        snapshotId: intent.snapshotId,
        status: "missing_recipient",
        providerMessageId: null,
        error: "Recipient email is missing.",
        retryable: true,
      });
      continue;
    }

    try {
      const response = await send(publicationMessage(
        { ...intent, recipientEmail: intent.recipientEmail },
        archiveBaseUrl,
      ));
      results.push({
        snapshotId: intent.snapshotId,
        status: "sent",
        providerMessageId: response.messageId,
        error: null,
        retryable: false,
      });
    } catch (error) {
      results.push({
        snapshotId: intent.snapshotId,
        status: "failed",
        providerMessageId: null,
        error: error instanceof Error ? error.message : "Unknown delivery error",
        retryable: true,
      });
    }
  }

  return results;
}
