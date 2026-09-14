import { afterEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "INSTALLATION_ORGANIZATION_NAME",
  "INSTALLATION_SHORT_NAME",
  "INSTALLATION_PRODUCT_NAME",
  "INSTALLATION_LOGO_URL",
  "INSTALLATION_BRAND_ACCENT",
  "INSTALLATION_BRAND_PRIMARY",
] as const;

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

async function setAcmeBrand() {
  process.env.INSTALLATION_ORGANIZATION_NAME = "Acme Agency";
  process.env.INSTALLATION_SHORT_NAME = "Acme";
  process.env.INSTALLATION_PRODUCT_NAME = "Acme OS";
  process.env.INSTALLATION_LOGO_URL = "https://assets.acme.test/logo.png";
  process.env.INSTALLATION_BRAND_ACCENT = "#112233";
  process.env.INSTALLATION_BRAND_PRIMARY = "#445566";
  vi.resetModules();
}

describe("transactional email installation branding", () => {
  it("brands password-reset email with the customer installation", async () => {
    await setAcmeBrand();
    const { passwordResetEmail } = await import("./password-reset");
    const mail = passwordResetEmail({ resetUrl: "https://app.acme.test/reset" });

    expect(mail.subject).toBe("Reset your Acme password");
    expect(mail.html).toContain("Acme Agency");
    expect(mail.html).toContain("https://assets.acme.test/logo.png");
    expect(mail.html).toContain("#112233");
    expect(mail.text).toContain("Acme account");
    expect(mail.html).not.toContain("All Star Life Group");
  });

  it("brands invite email with customer identity while preserving the same flow", async () => {
    await setAcmeBrand();
    const { welcomeEmail } = await import("./welcome");
    const mail = welcomeEmail({
      firstName: "Taylor",
      setupUrl: "https://app.acme.test/auth/confirm",
    });

    expect(mail.subject).toBe("You're invited to Acme — set up your account");
    expect(mail.html).toContain("Welcome to Acme, Taylor.");
    expect(mail.html).toContain("Acme Agency");
    expect(mail.text).toContain("Acme team");
    expect(mail.html).not.toContain("All Star Life Group");
  });

  it("brands support notifications with the customer product name", async () => {
    await setAcmeBrand();
    const { bugReportEmail } = await import("./bug-report");
    const mail = bugReportEmail({
      message: "Example problem",
      reporterName: "Taylor",
      reporterEmail: "taylor@acme.test",
      hasScreenshot: false,
    });

    expect(mail.html).toContain("inside Acme OS");
    expect(mail.html).toContain("Acme Agency");
    expect(mail.text).toContain("Acme Agency");
    expect(mail.html).not.toContain("All Star OS");
  });
});
