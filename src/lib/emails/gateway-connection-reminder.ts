import { buttonRow, fallbackRow, footerRow, headingRow, paragraphRow, shell } from "./_layout";
import type { GatewayReminderVariant } from "@/lib/gateway/reminders";

export function gatewaySettingsUrl(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/$/, "")}/producer?settings=gateway`;
}

export function gatewayConnectionReminderEmail({
  variant,
  appBaseUrl,
}: {
  variant: GatewayReminderVariant;
  appBaseUrl: string;
}): { subject: string; html: string; text: string; ctaUrl: string } {
  const reconnect = variant === "reconnect";
  const subject = reconnect ? "Reconnect Your Gateway" : "Connect Your Gateway";
  const ctaUrl = gatewaySettingsUrl(appBaseUrl);
  const body = reconnect
    ? "Your Gateway has disconnected. Please reconnect so we can run your scorecard."
    : "Please connect your personal Gateway so we can run your scorecard and keep Gateway-driven numbers current.";
  const secondary = "You can keep using All Star OS if you choose to connect later.";

  return {
    subject,
    ctaUrl,
    html: shell({
      subject,
      preheader: body,
      rows: [
        headingRow(subject),
        paragraphRow(body),
        paragraphRow(secondary, { tight: true }),
        buttonRow(reconnect ? "Reconnect Gateway" : "Connect Gateway", ctaUrl),
        fallbackRow(ctaUrl),
        footerRow("Gateway connection reminders never lock you out of All Star OS."),
      ].join("\n"),
    }),
    text: [
      subject,
      "",
      body,
      "",
      secondary,
      "",
      `${reconnect ? "Reconnect" : "Connect"} Gateway:`,
      ctaUrl,
      "",
      "Gateway connection reminders never lock you out of All Star OS.",
    ].join("\n"),
  };
}