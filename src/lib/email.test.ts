import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

import { sendEmail } from "./email";

describe("sendEmail", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM;
  const originalReplyTo = process.env.RESEND_REPLY_TO;

  beforeEach(() => {
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: "message-1" }, error: null });
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM = "All Star <test@example.com>";
    process.env.RESEND_REPLY_TO = "support@example.com";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = originalFrom;
    if (originalReplyTo === undefined) delete process.env.RESEND_REPLY_TO;
    else process.env.RESEND_REPLY_TO = originalReplyTo;
  });

  it("forwards the stable delivery idempotency key to Resend", async () => {
    const result = await sendEmail({
      to: "recipient@example.com",
      subject: "Your August Scorecard Is Ready",
      text: "Ready",
      idempotencyKey: "snapshot-1:producer_email",
    });

    expect(result).toEqual({ ok: true, id: "message-1" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][1]).toEqual({
      idempotencyKey: "snapshot-1:producer_email",
    });
  });

});
