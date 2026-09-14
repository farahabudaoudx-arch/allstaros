import { afterEach, describe, expect, it } from "vitest";
import {
  installationReplyToEmail,
  installationSupportEmail,
  installationTimezone,
} from "./runtime";

const original = { ...process.env };

afterEach(() => {
  for (const key of [
    "RESEND_REPLY_TO",
    "INSTALLATION_REPLY_TO_EMAIL",
    "BUG_REPORT_TO",
    "INSTALLATION_SUPPORT_EMAIL",
    "INSTALLATION_TIMEZONE",
  ]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("installation runtime env mirror", () => {
  it("keeps existing explicit email env vars highest priority", () => {
    process.env.INSTALLATION_REPLY_TO_EMAIL = "customer@example.com";
    process.env.RESEND_REPLY_TO = "explicit@example.com";
    process.env.INSTALLATION_SUPPORT_EMAIL = "support@example.com";
    process.env.BUG_REPORT_TO = "bugs@example.com";
    expect(installationReplyToEmail()).toBe("explicit@example.com");
    expect(installationSupportEmail()).toBe("bugs@example.com");
  });

  it("uses installation email values when explicit overrides are absent", () => {
    delete process.env.RESEND_REPLY_TO;
    delete process.env.BUG_REPORT_TO;
    process.env.INSTALLATION_REPLY_TO_EMAIL = "reply@agency.test";
    process.env.INSTALLATION_SUPPORT_EMAIL = "support@agency.test";
    expect(installationReplyToEmail()).toBe("reply@agency.test");
    expect(installationSupportEmail()).toBe("support@agency.test");
  });

  it("falls back to current All Star values and rejects invalid timezones", () => {
    delete process.env.RESEND_REPLY_TO;
    delete process.env.INSTALLATION_REPLY_TO_EMAIL;
    delete process.env.BUG_REPORT_TO;
    delete process.env.INSTALLATION_SUPPORT_EMAIL;
    process.env.INSTALLATION_TIMEZONE = "not/a-timezone";
    expect(installationReplyToEmail()).toBe("nicholasverge@gmail.com");
    expect(installationSupportEmail()).toBe("nicholasverge@gmail.com");
    expect(installationTimezone()).toBe("America/Chicago");
  });

  it("accepts an installation-specific IANA timezone", () => {
    process.env.INSTALLATION_TIMEZONE = "America/Los_Angeles";
    expect(installationTimezone()).toBe("America/Los_Angeles");
  });
});
