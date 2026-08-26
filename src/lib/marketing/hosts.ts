export const MARKETING_HOSTS = new Set([
  "allstarlifegroup.com",
  "www.allstarlifegroup.com",
  "marketing.localhost",
]);

export function requestHostname(hostHeader: string | null, fallback: string) {
  return hostHeader?.split(":")[0].toLowerCase() ?? fallback.toLowerCase();
}

export function isMarketingHostname(hostname: string) {
  return MARKETING_HOSTS.has(hostname.toLowerCase());
}
