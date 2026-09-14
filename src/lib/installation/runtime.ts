import { ALL_STAR_INSTALLATION_DEFAULTS } from "./defaults";

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function installationReplyToEmail(): string {
  return (
    envValue("RESEND_REPLY_TO") ??
    envValue("INSTALLATION_REPLY_TO_EMAIL") ??
    ALL_STAR_INSTALLATION_DEFAULTS.replyToEmail
  );
}

export function installationSupportEmail(): string {
  return (
    envValue("BUG_REPORT_TO") ??
    envValue("INSTALLATION_SUPPORT_EMAIL") ??
    ALL_STAR_INSTALLATION_DEFAULTS.supportEmail
  );
}

export function installationTimezone(): string {
  const value = envValue("INSTALLATION_TIMEZONE") ?? ALL_STAR_INSTALLATION_DEFAULTS.timezone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return ALL_STAR_INSTALLATION_DEFAULTS.timezone;
  }
}
