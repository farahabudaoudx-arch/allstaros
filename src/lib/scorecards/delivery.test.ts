import { describe, expect, it, vi } from "vitest";
import { deliverScorecardPublications, type ScorecardPublicationMessage } from "./delivery";

describe("Scorecard publication delivery", () => {
  it("sends distinct Producer and Builder emails for a dual-role member", async () => {
    const send = vi.fn(async (_message: ScorecardPublicationMessage) => ({ messageId: "message-1" }));
    const result = await deliverScorecardPublications({
      archiveBaseUrl: "https://app.allstarlifegroup.com/scorecards",
      intents: [
        { snapshotId: "producer-snapshot", personId: "builder-a", deliveryType: "producer_email", recipientEmail: "alex@example.com", status: "pending", idempotencyKey: "producer-key" },
        { snapshotId: "builder-snapshot", personId: "builder-a", deliveryType: "builder_email", recipientEmail: "alex@example.com", status: "pending", idempotencyKey: "builder-key" },
      ],
      send,
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([message]) => message.subject)).toEqual([
      "Your Producer Scorecard is ready",
      "Your Builder Scorecard is ready",
    ]);
    expect(send.mock.calls.map(([message]) => message.idempotencyKey)).toEqual(["producer-key", "builder-key"]);
    expect(result.map(({ status }) => status)).toEqual(["sent", "sent"]);
  });

  it("records a missing email as a delivery error without calling the adapter", async () => {
    const send = vi.fn();
    const [result] = await deliverScorecardPublications({
      archiveBaseUrl: "https://app.allstarlifegroup.com/scorecards",
      intents: [{ snapshotId: "snapshot", personId: "builder-a", deliveryType: "builder_email", recipientEmail: null, status: "missing_recipient", idempotencyKey: "missing-key" }],
      send,
    });

    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "missing_recipient", retryable: true });
  });
});
