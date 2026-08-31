import { describe, expect, it, vi } from "vitest";
import {
  deliverScorecardPublications,
  type ScorecardDeliveryRecord,
  type ScorecardPublicationMessage,
} from "./delivery";

function delivery(overrides: Partial<ScorecardDeliveryRecord> = {}): ScorecardDeliveryRecord {
  return {
    deliveryId: "delivery-1",
    snapshotId: "snapshot-1",
    runId: "run-1",
    personId: "person-1",
    deliveryType: "producer_email",
    recipientEmail: "alex@example.com",
    status: "pending",
    idempotencyKey: "snapshot-1:producer_email",
    attemptCount: 0,
    lastAttemptedAt: null,
    period: { kind: "monthly", start: "2026-08-01", end: "2026-08-31" },
    ...overrides,
  };
}

describe("Scorecard publication delivery", () => {
  it("sends distinct Producer and Builder deliveries for a dual-role member", async () => {
    const send = vi.fn(async (_message: ScorecardPublicationMessage) => ({ messageId: "message-1" }));
    const result = await deliverScorecardPublications({
      appBaseUrl: "https://app.allstarlifegroup.com",
      deliveries: [
        delivery(),
        delivery({
          deliveryId: "delivery-2",
          snapshotId: "snapshot-2",
          deliveryType: "builder_email",
          idempotencyKey: "snapshot-2:builder_email",
        }),
      ],
      send,
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([message]) => message.subject)).toEqual([
      "Your August Scorecard Is Ready",
      "Your August Scorecard Is Ready",
    ]);
    expect(send.mock.calls[0][0].html).toContain("Producer Scorecard");
    expect(send.mock.calls[1][0].html).toContain("Builder Scorecard");
    expect(send.mock.calls.map(([message]) => message.ctaUrl)).toEqual([
      "https://app.allstarlifegroup.com/producer/scorecards",
      "https://app.allstarlifegroup.com/producer/scorecards",
    ]);
    expect(send.mock.calls.map(([message]) => message.idempotencyKey)).toEqual([
      "snapshot-1:producer_email",
      "snapshot-2:builder_email",
    ]);
    expect(result.map(({ status }) => status)).toEqual(["sent", "sent"]);
  });

  it("records a missing email without calling the adapter", async () => {
    const send = vi.fn();
    const [result] = await deliverScorecardPublications({
      appBaseUrl: "https://app.allstarlifegroup.com",
      deliveries: [delivery({ recipientEmail: null, status: "missing_recipient" })],
      send,
    });

    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "missing_recipient", retryable: false });
  });

  it("records a provider failure without throwing through publication", async () => {
    const send = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    const [result] = await deliverScorecardPublications({
      appBaseUrl: "https://app.allstarlifegroup.com",
      deliveries: [delivery()],
      send,
    });

    expect(result).toMatchObject({
      status: "failed",
      providerMessageId: null,
      error: "provider unavailable",
      retryable: true,
    });
  });

  it("normalizes unexpected provider errors without fabricating success", async () => {
    const send = vi.fn(async () => {
      throw { provider: "down" };
    });
    const [result] = await deliverScorecardPublications({
      appBaseUrl: "https://app.allstarlifegroup.com",
      deliveries: [delivery()],
      send,
    });

    expect(result).toMatchObject({ status: "failed", error: "Unknown delivery error" });
  });

  it("never resends a delivery already persisted as sent", async () => {
    const send = vi.fn();
    const [result] = await deliverScorecardPublications({
      appBaseUrl: "https://app.allstarlifegroup.com",
      deliveries: [delivery({ status: "sent" })],
      send,
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.status).toBe("already_sent");
  });
});