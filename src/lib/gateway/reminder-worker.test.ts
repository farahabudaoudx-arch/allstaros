import { describe, expect, it, vi } from "vitest";
import {
  gatewayReminderIsInDeliveryWindow,
  processGatewayReminderOutbox,
  type GatewayReminderDelivery,
  type GatewayReminderStore,
} from "./reminder-worker";

function delivery(overrides: Partial<GatewayReminderDelivery> = {}): GatewayReminderDelivery {
  return {
    id: "reminder-1",
    personId: "person-1",
    reminderKey: "launch:v1",
    businessDate: "2026-09-03",
    variant: "connect",
    emailStatus: "pending",
    attemptCount: 0,
    lastAttemptedAt: null,
    recipientEmail: "producer@example.com",
    ...overrides,
  };
}

function storeFor(rows: GatewayReminderDelivery[]) {
  const store: GatewayReminderStore = {
    mintMonday: vi.fn().mockResolvedValue(0),
    loadDue: vi.fn().mockResolvedValue(rows),
    eligibility: vi.fn().mockResolvedValue({ connected: false, connectionInProgress: false }),
    claim: vi.fn().mockResolvedValue(true),
    stillSendable: vi.fn().mockResolvedValue(true),
    cancel: vi.fn().mockResolvedValue(undefined),
    recordMissingRecipient: vi.fn().mockResolvedValue(undefined),
    recordSent: vi.fn().mockResolvedValue(undefined),
    recordFailed: vi.fn().mockResolvedValue(undefined),
  };
  return store;
}

describe("Gateway reminder worker", () => {
  it("carries only a just-created launch reminder across Chicago midnight", () => {
    const now = new Date("2026-09-08T05:03:00.000Z"); // 00:03 Tuesday in Chicago.
    expect(gatewayReminderIsInDeliveryWindow({
      kind: "launch",
      business_date: "2026-09-07",
      created_at: "2026-09-08T04:58:00.000Z",
    }, "2026-09-08", now)).toBe(true);
    expect(gatewayReminderIsInDeliveryWindow({
      kind: "monday",
      business_date: "2026-09-07",
      created_at: "2026-09-08T04:58:00.000Z",
    }, "2026-09-08", now)).toBe(false);
    expect(gatewayReminderIsInDeliveryWindow({
      kind: "launch",
      business_date: "2026-09-07",
      created_at: "2026-09-08T04:40:00.000Z",
    }, "2026-09-08", now)).toBe(false);
  });

  it("does not mint weekly reminders on a non-Monday Chicago business date", async () => {
    const store = storeFor([]);
    await processGatewayReminderOutbox({
      store,
      send: vi.fn(),
      appBaseUrl: "https://app.example.com",
      now: new Date("2026-09-03T17:00:00.000Z"),
    });
    expect(store.mintMonday).not.toHaveBeenCalled();
  });

  it("mints Monday once per worker cycle and sends a due reminder", async () => {
    const row = delivery({
      reminderKey: "monday:2026-09-07",
      businessDate: "2026-09-07",
    });
    const store = storeFor([row]);
    vi.mocked(store.mintMonday).mockResolvedValue(1);
    const send = vi.fn().mockResolvedValue({ messageId: "provider-1" });

    const summary = await processGatewayReminderOutbox({
      store,
      send,
      appBaseUrl: "https://app.example.com",
      now: new Date("2026-09-07T15:00:00.000Z"),
    });

    expect(store.mintMonday).toHaveBeenCalledWith("2026-09-07");
    expect(summary.mondayMinted).toBe(1);
    expect(summary.sent).toBe(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "gateway-reminder:person-1:monday:2026-09-07",
    }));
  });

  it("defers while a hosted Gateway connection attempt is active", async () => {
    const store = storeFor([delivery()]);
    vi.mocked(store.eligibility).mockResolvedValue({
      connected: false,
      connectionInProgress: true,
    });
    const send = vi.fn();

    const summary = await processGatewayReminderOutbox({
      store,
      send,
      appBaseUrl: "https://app.example.com",
      now: new Date("2026-09-03T17:00:00.000Z"),
    });

    expect(summary.deferred).toBe(1);
    expect(store.claim).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("cancels instead of sending after the member reconnects", async () => {
    const store = storeFor([delivery({ variant: "reconnect" })]);
    vi.mocked(store.eligibility).mockResolvedValue({
      connected: true,
      connectionInProgress: false,
    });
    const send = vi.fn();

    const summary = await processGatewayReminderOutbox({
      store,
      send,
      appBaseUrl: "https://app.example.com",
      now: new Date("2026-09-03T17:00:00.000Z"),
    });

    expect(summary.cancelled).toBe(1);
    expect(store.cancel).toHaveBeenCalledWith("reminder-1", expect.any(String));
    expect(send).not.toHaveBeenCalled();
  });

  it("does not call the provider when the recipient email is missing", async () => {
    const store = storeFor([delivery({ recipientEmail: null })]);
    const send = vi.fn();

    const summary = await processGatewayReminderOutbox({
      store,
      send,
      appBaseUrl: "https://app.example.com",
      now: new Date("2026-09-03T17:00:00.000Z"),
    });

    expect(summary.missingRecipient).toBe(1);
    expect(store.recordMissingRecipient).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("records provider failure without breaking the reminder occurrence", async () => {
    const store = storeFor([delivery()]);
    const send = vi.fn().mockRejectedValue(new Error("provider unavailable"));

    const summary = await processGatewayReminderOutbox({
      store,
      send,
      appBaseUrl: "https://app.example.com",
      now: new Date("2026-09-03T17:00:00.000Z"),
    });

    expect(summary.failed).toBe(1);
    expect(store.recordFailed).toHaveBeenCalledWith(
      "reminder-1",
      "provider unavailable",
      expect.any(String),
    );
  });

  it("uses America/Chicago when UTC has already crossed into Tuesday", async () => {
    const store = storeFor([]);
    await processGatewayReminderOutbox({
      store,
      send: vi.fn(),
      appBaseUrl: "https://app.example.com",
      // 00:30 UTC Tuesday is still Monday evening in Chicago.
      now: new Date("2026-09-08T00:30:00.000Z"),
    });
    expect(store.mintMonday).toHaveBeenCalledWith("2026-09-07");
  });
});
