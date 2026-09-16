import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  recordLocalPilotEmail: vi.fn(),
  localPilot: false,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/local-pilot", () => ({
  isWhitelabelLocalPilot: () => mocks.localPilot,
  recordLocalPilotEmail: mocks.recordLocalPilotEmail,
}));

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
  const originalLocalPilot = process.env.WHITELABEL_LOCAL_PILOT;

  beforeEach(() => {
    mocks.localPilot = false;
    mocks.send.mockReset();
    mocks.recordLocalPilotEmail.mockReset();
    mocks.recordLocalPilotEmail.mockResolvedValue("local-message-1");
    mocks.send.mockResolvedValue({ data: { id: "message-1" }, error: null });
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM = "All Star <test@example.com>";
    process.env.RESEND_REPLY_TO = "support@example.com";
    delete process.env.WHITELABEL_LOCAL_PILOT;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = originalFrom;
    if (originalReplyTo === undefined) delete process.env.RESEND_REPLY_TO;
    else process.env.RESEND_REPLY_TO = originalReplyTo;
    if (originalLocalPilot === undefined) delete process.env.WHITELABEL_LOCAL_PILOT;
    else process.env.WHITELABEL_LOCAL_PILOT = originalLocalPilot;
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

  it("records the resolved sender and reply-to in local pilot mode", async () => {
    mocks.localPilot = true;
    process.env.WHITELABEL_LOCAL_PILOT = "1";

    const result = await sendEmail({
      to: "recipient@example.com",
      subject: "Local delivery",
      text: "Ready",
      idempotencyKey: "local-email-1",
    });

    expect(result).toEqual({ ok: true, id: "local-message-1" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.recordLocalPilotEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: "All Star <test@example.com>",
      to: "recipient@example.com",
      replyTo: "support@example.com",
      idempotencyKey: "local-email-1",
    }));
  });
});
