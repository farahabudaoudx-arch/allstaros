import { createServiceRoleClient } from "@/lib/supabase/server";

type GeoResult = { city: string | null; region: string | null; country: string | null };

// Skip geo for loopback / private ranges — they never resolve to a real city.
function isPublicIp(ip: string): boolean {
  if (!ip) return false;
  if (ip === "::1" || ip.startsWith("127.")) return false;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return false;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return false; // IPv6 ULA
  return true;
}

async function resolveGeo(ip: string): Promise<GeoResult> {
  const empty: GeoResult = { city: null, region: null, country: null };
  if (!isPublicIp(ip)) return empty;
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { "user-agent": "AllStarOS/1.0" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return empty;
    const j = (await res.json()) as {
      city?: string;
      region?: string;
      country_name?: string;
    };
    return {
      city: j.city ?? null,
      region: j.region ?? null,
      country: j.country_name ?? null,
    };
  } catch {
    return empty;
  }
}

/**
 * Record a successful login. Best-effort: any failure (geo hiccup, insert error)
 * is swallowed so it never blocks the sign-in redirect.
 *
 * Auto-flag rule: flag only when we successfully resolved a location AND the
 * person has prior logins from resolved locations, none of which match this
 * region+country. This avoids false positives on the first login or when the
 * geo lookup fails.
 */
export async function recordLoginEvent(params: {
  personId: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  const { personId, ip, userAgent } = params;
  if (!personId) return;
  try {
    const admin = createServiceRoleClient();
    const geo = ip ? await resolveGeo(ip) : { city: null, region: null, country: null };

    const { data: prior } = await admin
      .from("login_event")
      .select("region, country")
      .eq("person_id", personId)
      .order("logged_in_at", { ascending: false })
      .limit(50);

    let flagged = false;
    if (geo.country) {
      const resolvedPrior = (prior ?? []).filter((p) => p.country);
      if (resolvedPrior.length > 0) {
        flagged = !resolvedPrior.some(
          (p) => p.region === geo.region && p.country === geo.country,
        );
      }
    }

    await admin.from("login_event").insert({
      person_id: personId,
      ip,
      user_agent: userAgent,
      city: geo.city,
      region: geo.region,
      country: geo.country,
      flagged,
    });
  } catch {
    // Never let logging break a sign-in.
  }
}
