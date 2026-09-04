import { describe, expect, it } from "vitest";
import {
  gatewayConnectionReminderEmail,
  gatewaySettingsUrl,
} from "./gateway-connection-reminder";

describe("Gateway connection reminder email", () => {
  it("uses the Gateway settings deep-link", () => {
    expect(gatewaySettingsUrl("https://preview.example.com/"))
      .toBe("https://preview.example.com/producer?settings=gateway");
  });

  it("uses the exact reconnect sentence required by the handoff", () => {
    const mail = gatewayConnectionReminderEmail({
      variant: "reconnect",
      appBaseUrl: "https://preview.example.com",
    });
    const exact = "Your Gateway has disconnected. Please reconnect so we can run your scorecard.";
    expect(mail.subject).toBe("Reconnect Your Gateway");
    expect(mail.html).toContain(exact);
    expect(mail.text).toContain(exact);
    expect(mail.ctaUrl).toBe("https://preview.example.com/producer?settings=gateway");
  });

  it("keeps connect reminders non-blocking and never advises disabling 2FA", () => {
    const mail = gatewayConnectionReminderEmail({
      variant: "connect",
      appBaseUrl: "https://preview.example.com",
    });
    expect(mail.text).toContain("You can keep using All Star OS");
    expect(`${mail.html}\n${mail.text}`).not.toMatch(/disable.{0,20}2FA/i);
  });
});