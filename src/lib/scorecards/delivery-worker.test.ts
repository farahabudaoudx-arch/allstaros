import { describe, expect, it, vi } from "vitest";
import type { ScorecardDeliveryRecord, ScorecardDeliveryResult } from "./delivery";
import { processScorecardDeliveryOutbox, type ScorecardDeliveryStore } from "./delivery-worker";

function record(overrides: Partial<ScorecardDeliveryRecord> = {}): ScorecardDeliveryRecord {
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

class FakeStore implements ScorecardDeliveryStore {
  records: ScorecardDeliveryRecord[];
  results: ScorecardDeliveryResult[] = [];
  refreshedRuns: string[] = [];

  constructor(records: ScorecardDeliveryRecord[]) {
    this.records = records;
  }

  async loadDue(now: Date, limit: number) {
    const cutoff = now.getTime() - 5 * 60 * 1_000;
    return this.records
      .filter((item) => (item.status === "pending" || item.status === "failed")
        && (!item.lastAttemptedAt || Date.parse(item.lastAttemptedAt) <= cutoff))
      .slice(0, limit)
      .map((item) => ({ ...item }));
  }

  async claim(delivery: ScorecardDeliveryRecord, attemptedAt: string) {
    const current = this.records.find((item) => item.deliveryId === delivery.deliveryId);
    if (!current || current.attemptCount !== delivery.attemptCount || (current.status !== "pending" && current.status !== "failed")) {
      return false;
    }
    current.attemptCount += 1;
    current.lastAttemptedAt = attemptedAt;
    return true;
  }

  async recordResult(result: ScorecardDeliveryResult) {
    this.results.push(result);
    const current = this.records.find((item) => item.deliveryId === result.deliveryId);
    if (!current || result.status === "already_sent") return;
    current.status = result.status;
  }

  async refreshRun(runId: string) {
    this.refreshedRuns.push(runId);
  }
}

describe("Scorecard delivery outbox", () => {
  it("records a successful send after publication without changing the published snapshot", async () => {
    const store = new FakeStore([record()]);
    const publishedSnapshot = { id: "snapshot-1", status: "published", readable: true };
    const send = vi.fn(async () => ({ messageId: "resend-message-1" }));

    const summary = await processScorecardDeliveryOutbox({
      store,
      send,
      appBaseUrl: "https://app.allstarlifegroup.com",
      now: new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({ loaded: 1, claimed: 1, sent: 1, failed: 0 });
    expect(store.results[0]).toMatchObject({ status: "sent", providerMessageId: "resend-message-1" });
    expect(store.refreshedRuns).toEqual(["run-1"]);
    expect(publishedSnapshot).toEqual({ id: "snapshot-1", status: "published", readable: true });
  });

  it("records a missing recipient, never calls Resend, and leaves publication intact", async () => {
    const store = new FakeStore([record({ recipientEmail: null })]);
    const publishedSnapshot = { id: "snapshot-1", status: "published", readable: true };
    const send = vi.fn();

    const summary = await processScorecardDeliveryOutbox({
      store,
      send,
      appBaseUrl: "https://app.allstarlifegroup.com",
      now: new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(send).not.toHaveBeenCalled();
    expect(summary.missingRecipient).toBe(1);
    expect(store.results[0]).toMatchObject({ status: "missing_recipient" });
    expect(publishedSnapshot.readable).toBe(true);
  });

  it("records provider failure without rolling back the published Scorecard", async () => {
    const store = new FakeStore([record()]);
    const publishedSnapshot = { id: "snapshot-1", status: "published", readable: true };
    const send = vi.fn(async () => {
      throw new Error("Resend unavailable");
    });

    const summary = await processScorecardDeliveryOutbox({
      store,
      send,
      appBaseUrl: "https://app.allstarlifegroup.com",
      now: new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(summary.failed).toBe(1);
    expect(store.results[0]).toMatchObject({ status: "failed", error: "Resend unavailable" });
    expect(store.refreshedRuns).toEqual(["run-1"]);
    expect(publishedSnapshot).toEqual({ id: "snapshot-1", status: "published", readable: true });
  });

  it("does not resend a delivery after success on a repeated worker invocation", async () => {
    const store = new FakeStore([record()]);
    const send = vi.fn(async () => ({ messageId: "resend-message-1" }));

    await processScorecardDeliveryOutbox({
      store,
      send,
      appBaseUrl: "https://app.allstarlifegroup.com",
      now: new Date("2026-09-01T12:00:00.000Z"),
    });
    const second = await processScorecardDeliveryOutbox({
      store,
      send,
      appBaseUrl: "https://app.allstarlifegroup.com",
      now: new Date("2026-09-01T12:10:00.000Z"),
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(second.loaded).toBe(0);
  });

  it("retries a failed delivery with the same provider idempotency key", async () => {
    const store = new FakeStore([record()]);
    const keys: string[] = [];
    let attempt = 0;
    const send = vi.fn(async (message) => {
      keys.push(message.idempotencyKey);
      attempt += 1;
      if (attempt === 1) throw new Error("temporary provider failure");
      return { messageId: "resend-message-1" };
    });

    await processScorecardDeliveryOutbox({
      store,
      send,
      appBaseUrl: "https://app.allstarlifegroup.com",
      now: new Date("2026-09-01T12:00:00.000Z"),
    });
    const retry = await processScorecardDeliveryOutbox({
      store,
      send,
      appBaseUrl: "https://app.allstarlifegroup.com",
      now: new Date("2026-09-01T12:06:00.000Z"),
    });

    expect(retry.sent).toBe(1);
    expect(keys).toEqual(["snapshot-1:producer_email", "snapshot-1:producer_email"]);
  });
});