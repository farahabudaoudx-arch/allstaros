import { scorecardReadyEmail, type FrozenScorecardPeriod, type ScorecardReadyDeliveryType } from "@/lib/emails/scorecard-ready";

export type ScorecardDeliveryStatus = "pending" | "sent" | "failed" | "missing_recipient";

export type ScorecardDeliveryRecord = {
  deliveryId: string;
  snapshotId: string;
  runId: string;
  personId: string;
  deliveryType: ScorecardReadyDeliveryType;
  recipientEmail: string | null;
  status: ScorecardDeliveryStatus;
  idempotencyKey: string;
  attemptCount: number;
  lastAttemptedAt: string | null;
  period: FrozenScorecardPeriod;
};

export type ScorecardPublicationMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  ctaUrl: string;
  idempotencyKey: string;
};

export type ScorecardDeliveryResult = {
  deliveryId: string;
  snapshotId: string;
  runId: string;
  status: "sent" | "failed" | "missing_recipient" | "already_sent";
  providerMessageId: string | null;
  error: string | null;
  retryable: boolean;
};

export function deliveryErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown delivery error";
  return message.slice(0, 1_000);
}

export function publicationMessage(
  delivery: ScorecardDeliveryRecord & { recipientEmail: string },
  appBaseUrl: string,
): ScorecardPublicationMessage {
  const mail = scorecardReadyEmail({
    period: delivery.period,
    deliveryType: delivery.deliveryType,
    appBaseUrl,
  });
  return {
    to: delivery.recipientEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    ctaUrl: mail.ctaUrl,
    idempotencyKey: delivery.idempotencyKey,
  };
}

export async function deliverScorecardPublications({
  deliveries,
  appBaseUrl,
  send,
}: {
  deliveries: ScorecardDeliveryRecord[];
  appBaseUrl: string;
  send: (message: ScorecardPublicationMessage) => Promise<{ messageId: string }>;
}): Promise<ScorecardDeliveryResult[]> {
  const results: ScorecardDeliveryResult[] = [];

  for (const delivery of deliveries) {
    if (delivery.status === "sent") {
      results.push({
        deliveryId: delivery.deliveryId,
        snapshotId: delivery.snapshotId,
        runId: delivery.runId,
        status: "already_sent",
        providerMessageId: null,
        error: null,
        retryable: false,
      });
      continue;
    }

    const recipientEmail = delivery.recipientEmail?.trim() || null;
    if (!recipientEmail || delivery.status === "missing_recipient") {
      results.push({
        deliveryId: delivery.deliveryId,
        snapshotId: delivery.snapshotId,
        runId: delivery.runId,
        status: "missing_recipient",
        providerMessageId: null,
        error: "Recipient email is missing.",
        retryable: false,
      });
      continue;
    }

    try {
      const response = await send(publicationMessage(
        { ...delivery, recipientEmail },
        appBaseUrl,
      ));
      results.push({
        deliveryId: delivery.deliveryId,
        snapshotId: delivery.snapshotId,
        runId: delivery.runId,
        status: "sent",
        providerMessageId: response.messageId,
        error: null,
        retryable: false,
      });
    } catch (error) {
      results.push({
        deliveryId: delivery.deliveryId,
        snapshotId: delivery.snapshotId,
        runId: delivery.runId,
        status: "failed",
        providerMessageId: null,
        error: deliveryErrorMessage(error),
        retryable: true,
      });
    }
  }

  return results;
}