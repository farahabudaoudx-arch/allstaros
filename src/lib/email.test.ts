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
  const originalTransport = process.env.EMAIL_TRANSPORT;
  const originalMailpitUrl = process.env.MAILPIT_URL;
  const originalMailpitFrom = process.env.MAILPIT_FROM;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: "message-1" }, error: null });
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM = "All Star <test@example.com>";
    process.env.RESEND_REPLY_TO = "support@example.com";
    delete process.env.EMAIL_TRANSPORT;
    delete process.env.MAILPIT_URL;
    delete process.env.MAILPIT_FROM;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = originalFrom;
    if (originalReplyTo === undefined) delete process.env.RESEND_REPLY_TO;
    else process.env.RESEND_REPLY_TO = originalReplyTo;
    if (originalTransport === undefined) delete process.env.EMAIL_TRANSPORT;
    else process.env.EMAIL_TRANSPORT = originalTransport;
    if (originalMailpitUrl === undefined) delete process.env.MAILPIT_URL;
    else process.env.MAILPIT_URL = originalMailpitUrl;
    if (originalMailpitFrom === undefined) delete process.env.MAILPIT_FROM;
    else process.env.MAILPIT_FROM = originalMailpitFrom;
    vi.restoreAllMocks();
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

  it("captures local validation email in Mailpit without calling Resend", async () => {
    process.env.EMAIL_TRANSPORT = "mailpit";
    process.env.MAILPIT_URL = "http://127.0.0.1:54624";
    process.env.MAILPIT_FROM = "Northstar OS <no-reply@northstar-pilot.test>";
    delete process.env.RESEND_API_KEY;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ID: "mailpit-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await sendEmail({
      to: ["first@example.com", "second@example.com"],
      subject: "Welcome",
      html: "<strong>Hello</strong>",
      text: "Hello",
      replyTo: "Support <support@example.com>",
      idempotencyKey: "invite-1",
      attachments: [
        {
          filename: "hello.txt",
          content: Buffer.from("hello"),
          contentType: "text/plain",
        },
      ],
    });

    expect(result).toEqual({ ok: true, id: "mailpit-1" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:54624/api/v1/send");
    expect(init?.method).toBe("POST");
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      From: { Email: "no-reply@northstar-pilot.test", Name: "Northstar OS" },
      To: [{ Email: "first@example.com" }, { Email: "second@example.com" }],
      ReplyTo: [{ Email: "support@example.com", Name: "Support" }],
      Subject: "Welcome",
      HTML: "<strong>Hello</strong>",
      Text: "Hello",
      Headers: { "X-Idempotency-Key": "invite-1" },
      Attachments: [
        {
          Filename: "hello.txt",
          Content: Buffer.from("hello").toString("base64"),
          ContentType: "text/plain",
        },
      ],
    });
  });

  it("rejects non-loopback Mailpit endpoints", async () => {
    process.env.EMAIL_TRANSPORT = "mailpit";
    process.env.MAILPIT_URL = "https://mail.example.com";

    const result = await sendEmail({
      to: "recipient@example.com",
      subject: "Local only",
      text: "No network send",
    });

    expect(result).toEqual({
      ok: false,
      error: "MAILPIT_URL must point to a loopback-only local Mailpit instance.",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

});
