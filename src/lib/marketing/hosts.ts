import { marketingHosts } from "@/lib/installation/routing";

export function requestHostname(hostHeader: string | null, fallback: string) {
  return hostHeader?.split(":")[0].toLowerCase() ?? fallback.toLowerCase();
}

export function isMarketingHostname(hostname: string) {
  return marketingHosts().has(hostname.toLowerCase());
}
