const DEFAULT_MARKETING_HOSTS = ["allstarlifegroup.com", "www.allstarlifegroup.com", "marketing.localhost"];

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function marketingHosts(): Set<string> {
  const configured = csv(process.env.MARKETING_HOSTS);
  return new Set(configured.length ? configured : DEFAULT_MARKETING_HOSTS);
}

export function flaggedAppHost(): string | null {
  const value = process.env.FLAGGED_APP_HOST?.trim().toLowerCase();
  return value === "" ? null : value || "app.allstarlifegroup.com";
}

export function backupAppOrigin(): string | null {
  const raw = process.env.BACKUP_APP_ORIGIN?.trim() || "https://all-star-agency.vercel.app";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
