import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  computeSubmittedApTeamLeaderboards,
  DISCORD_LEADERBOARD_TZ,
  type DiscordPeriod,
  type SubmittedApLeaderboardRow,
} from "@/lib/producer/submitted-ap-leaderboard";

// Discord delivery for sale notifications and team AP leaderboards.
// Destinations live in notification_destinations (many per builder, each with
// a purpose). Leaderboard posts are edited in place; the message ids and
// content hashes live in discord_leaderboard_messages. No client PII is ever
// sent (producer name, AP, carrier only), and every payload disables mentions.
//
// NOTE: this is a plain server module, not a "use server" action file. Its
// exports must only be called from server code (server actions, API routes).
// Making them actions would expose e.g. rebuildDiscordLeaderboards(ownerId)
// as an unauthenticated endpoint.

// Only ever POST to a real Discord webhook host, never an arbitrary URL.
export function isDiscordWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      (host === "discord.com" ||
        host === "discordapp.com" ||
        host === "canary.discord.com" ||
        host === "ptb.discord.com") &&
      u.pathname.startsWith("/api/webhooks/")
    );
  } catch {
    return false;
  }
}

// Show enough of a webhook URL to recognize it without leaking the token.
export function maskWebhookUrl(url: string): string {
  return `discord.com/api/webhooks/...${url.slice(-4)}`;
}

export type DestinationPurpose =
  | "sale_submitted"
  | "leaderboard_daily"
  | "leaderboard_wtd"
  | "leaderboard_mtd"
  | "leaderboard_ytd";

export const ALL_DESTINATION_PURPOSES: DestinationPurpose[] = [
  "sale_submitted",
  "leaderboard_daily",
  "leaderboard_wtd",
  "leaderboard_mtd",
  "leaderboard_ytd",
];

const PURPOSE_TO_PERIOD: Partial<Record<DestinationPurpose, DiscordPeriod>> = {
  leaderboard_daily: "daily",
  leaderboard_wtd: "wtd",
  leaderboard_mtd: "mtd",
  leaderboard_ytd: "ytd",
};

export type NotificationDestination = {
  id: string;
  owner_person_id: string;
  provider: string;
  purpose: DestinationPurpose;
  label: string | null;
  url: string;
  enabled: boolean;
};

/**
 * Walk UP the upline chain from `startPersonId` (max 15 hops, including the
 * start person), then load every enabled destination owned by anyone in the
 * chain, filtered to `purposes` and to URLs that pass isDiscordWebhook.
 * Returned grouped by owner, then by purpose.
 */
export async function resolveDiscordDestinations(
  admin: SupabaseClient,
  startPersonId: string,
  purposes: DestinationPurpose[],
): Promise<Map<string, Map<DestinationPurpose, NotificationDestination[]>>> {
  const grouped = new Map<string, Map<DestinationPurpose, NotificationDestination[]>>();
  if (!startPersonId || !purposes.length) return grouped;

  const chainIds: string[] = [];
  let current: string | null = startPersonId;
  for (let i = 0; i < 15; i++) {
    if (!current || chainIds.includes(current)) break;
    chainIds.push(current);
    const result = await admin
      .from("person")
      .select("upline_id")
      .eq("id", current)
      .maybeSingle();
    const row = result.data as { upline_id: string | null } | null;
    if (!row) break;
    current = row.upline_id;
  }

  const res = await admin
    .from("notification_destinations")
    .select("*")
    .in("owner_person_id", chainIds)
    .in("purpose", purposes)
    .eq("enabled", true);
  if (res.error) return grouped;

  for (const d of (res.data ?? []) as NotificationDestination[]) {
    if (!d.url || !isDiscordWebhook(d.url)) continue;
    let byPurpose = grouped.get(d.owner_person_id);
    if (!byPurpose) {
      byPurpose = new Map();
      grouped.set(d.owner_person_id, byPurpose);
    }
    const list = byPurpose.get(d.purpose) ?? [];
    list.push(d);
    byPurpose.set(d.purpose, list);
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// Low-level webhook calls. Every payload carries allowed_mentions: parse []
// so a leaderboard or sale post can never ping a role or @everyone.
// ---------------------------------------------------------------------------

type DiscordPayload = { content: string } | { embeds: unknown[] };

function withNoMentions(payload: DiscordPayload) {
  return { ...payload, allowed_mentions: { parse: [] as string[] } };
}

// Also trims trailing slashes so the /messages/{id} edit URL never ends up
// with a double slash (Discord 404s on those, which forces a re-post).
function stripQuery(url: string): string {
  const i = url.indexOf("?");
  const base = i === -1 ? url : url.slice(0, i);
  return base.replace(/\/+$/, "");
}

function withWait(url: string): string {
  return url.includes("?") ? `${url}&wait=true` : `${url}?wait=true`;
}

async function postDiscord(url: string, payload: DiscordPayload): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(withNoMentions(payload)),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Same POST, but with ?wait=true so Discord returns the created message JSON.
async function postDiscordAndGetMessageId(
  url: string,
  payload: DiscordPayload,
): Promise<string | null> {
  try {
    const res = await fetch(withWait(url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(withNoMentions(payload)),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string } | null;
    return json?.id ?? null;
  } catch {
    return null;
  }
}

// PATCH an existing webhook message. Returns the HTTP status (0 on network
// failure); a 404 means the message was deleted in Discord.
async function editDiscordMessage(
  url: string,
  messageId: string,
  payload: DiscordPayload,
): Promise<number> {
  try {
    const res = await fetch(`${stripQuery(url)}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(withNoMentions(payload)),
    });
    return res.status;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Message formatting.
// ---------------------------------------------------------------------------

type SaleMessageData = { producerName: string; apStr: string; carrier: string | null };

async function sendSaleSubmittedMessage(
  destination: NotificationDestination,
  sale: SaleMessageData,
): Promise<boolean> {
  let content = `🎉 **${sale.producerName}** just signed a new client! ${sale.apStr} AP`;
  if (sale.carrier) content += ` · ${sale.carrier}`;
  return postDiscord(destination.url, { content });
}

const PERIOD_TITLE: Record<DiscordPeriod, string> = {
  daily: "Daily Leaderboard (Today)",
  wtd: "Weekly Leaderboard (Mon → Now)",
  mtd: "Monthly Leaderboard (1st → Now)",
  ytd: "Yearly Leaderboard (Jan 1 → Now)",
};

const EMBED_COLOR = 0x5865f2;
const MEDALS = ["🥇", "🥈", "🥉"];

// "Jul 01, 2026" for a YYYY-MM-DD date column (noon UTC avoids day drift).
function formatIsoDay(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00Z`);
  if (isNaN(d.getTime())) return isoDay;
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

// "Jul 02, 2026 12:00" for a moment in the leaderboard timezone.
function formatZonedMinute(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")} ${get("day")}, ${get("year")} ${get("hour")}:${get("minute")}`;
}

function centsToUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type DiscordEmbed = {
  title: string;
  description: string;
  color: number;
  footer?: { text: string };
};

// Matches the board style the team knows from the old Discord bot: embed card
// with a range line, medals for the top three, bold names, and an AP/sales
// total in the footer.
function buildLeaderboardEmbed(
  period: DiscordPeriod,
  range: { from: string; to: string },
  rows: SubmittedApLeaderboardRow[],
): DiscordEmbed {
  const rangeLine = `Range: ${formatIsoDay(range.from)} 00:00 → ${formatZonedMinute(
    new Date(),
    DISCORD_LEADERBOARD_TZ,
  )} (${DISCORD_LEADERBOARD_TZ})`;

  const lines = [rangeLine, ""];
  let footer: { text: string } | undefined;
  if (!rows.length) {
    lines.push("No submitted sales yet for this period.");
  } else {
    lines.push("**Leaderboard**");
    rows.slice(0, 25).forEach((r, i) => {
      const rank = i < 3 ? MEDALS[i] : `#${i + 1}`;
      const sales = r.sales_count === 1 ? "1 sale" : `${r.sales_count} sales`;
      lines.push(`${rank} **${r.full_name}** - ${centsToUsd(r.submitted_ap_cents)} AP (${sales})`);
    });
    const totalCents = rows.reduce((sum, r) => sum + r.submitted_ap_cents, 0);
    const totalSales = rows.reduce((sum, r) => sum + r.sales_count, 0);
    footer = { text: `${centsToUsd(totalCents)} AP | ${totalSales} Sales` };
  }

  return {
    title: PERIOD_TITLE[period],
    description: lines.join("\n"),
    color: EMBED_COLOR,
    ...(footer ? { footer } : {}),
  };
}

// Cheap deterministic content hash for last_payload_hash: length plus a
// 32-bit rolling hash, base36. Only used to skip no-op edits.
function hashContent(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Edit-in-place leaderboard messages.
// ---------------------------------------------------------------------------

type StoredMessage = {
  id: string;
  message_id: string | null;
  last_payload_hash: string | null;
};

/**
 * Create or edit the one Discord message for (destination, period, period
 * start). Looked up by period_start only (NOT period_end): for wtd/mtd/ytd
 * the end is "today" and moves every day, so keying on it would post a brand
 * new message daily instead of editing the existing one. period_end on the
 * stored row is updated to track the current range. Skips the edit when the
 * content hash is unchanged, unless opts.force asks for an unconditional
 * edit (used by rebuild to resurrect messages deleted in Discord). On a 404
 * (the message was deleted in Discord), re-posts and stores the new message
 * id. Returns true when a Discord message was actually created or edited.
 */
async function createOrUpdateLeaderboardMessage(
  admin: SupabaseClient,
  destination: NotificationDestination,
  period: DiscordPeriod,
  range: { from: string; to: string },
  rows: SubmittedApLeaderboardRow[],
  opts?: { force?: boolean },
): Promise<boolean> {
  const embed = buildLeaderboardEmbed(period, range, rows);
  const payload = { embeds: [embed] };
  // Hash only what the board shows, minus the live "→ now" clock in the range
  // line, so a sale-less minute tick does not read as a content change.
  const hash = hashContent(
    JSON.stringify({ ...embed, description: embed.description.replace(/^Range:.*$/m, "") }),
  );

  const existingRes = await admin
    .from("discord_leaderboard_messages")
    .select("id, message_id, last_payload_hash")
    .eq("destination_id", destination.id)
    .eq("period_type", period)
    .eq("period_start", range.from)
    .order("last_updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existing = existingRes.data as StoredMessage | null;

  if (existing?.message_id) {
    if (!opts?.force && existing.last_payload_hash === hash) return false;
    const status = await editDiscordMessage(destination.url, existing.message_id, payload);
    if (status >= 200 && status < 300) {
      await admin
        .from("discord_leaderboard_messages")
        .update({
          period_end: range.to,
          last_payload_hash: hash,
          last_updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return true;
    }
    if (status !== 404) return false;
    // Deleted in Discord: fall through and post a fresh message.
  }

  const messageId = await postDiscordAndGetMessageId(destination.url, payload);
  if (!messageId) return false;
  if (existing) {
    await admin
      .from("discord_leaderboard_messages")
      .update({
        period_end: range.to,
        message_id: messageId,
        last_payload_hash: hash,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await admin.from("discord_leaderboard_messages").insert({
      destination_id: destination.id,
      period_type: period,
      period_start: range.from,
      period_end: range.to,
      message_id: messageId,
      last_payload_hash: hash,
      last_updated_at: new Date().toISOString(),
    });
  }
  return true;
}

/**
 * Recompute and re-post/edit one owner's OWN leaderboard destinations (no
 * upline walk) for the requested periods. Called from the settings "Rebuild
 * Discord Leaderboards" button. Forces the edit even when the content is
 * unchanged so a message deleted in Discord gets re-posted. Returns how many
 * messages were created or edited.
 */
export async function rebuildDiscordLeaderboards(
  ownerPersonId: string,
  periods: DiscordPeriod[],
): Promise<number> {
  const wanted = Array.from(new Set(periods));
  if (!ownerPersonId || !wanted.length) return 0;

  const admin = createServiceRoleClient();
  const res = await admin
    .from("notification_destinations")
    .select("*")
    .eq("owner_person_id", ownerPersonId)
    .in("purpose", wanted.map((p) => `leaderboard_${p}`))
    .eq("enabled", true);
  if (res.error) throw new Error(res.error.message);

  const destinations = ((res.data ?? []) as NotificationDestination[]).filter(
    (d) => d.url && isDiscordWebhook(d.url),
  );
  if (!destinations.length) return 0;

  const neededPeriods = Array.from(
    new Set(
      destinations
        .map((d) => PURPOSE_TO_PERIOD[d.purpose])
        .filter((p): p is DiscordPeriod => !!p),
    ),
  );
  const boards = await computeSubmittedApTeamLeaderboards(admin, {
    ownerPersonId,
    periods: neededPeriods,
  });

  let touched = 0;
  for (const d of destinations) {
    const period = PURPOSE_TO_PERIOD[d.purpose];
    if (!period) continue;
    const board = boards.get(period);
    if (!board) continue;
    const updated = await createOrUpdateLeaderboardMessage(
      admin,
      d,
      period,
      { from: board.from, to: board.to },
      board.rows,
      { force: true },
    );
    if (updated) touched++;
  }
  return touched;
}

/**
 * Fires after a NEW sale is inserted (called best-effort from the client
 * form's server action). Sends the celebration to every enabled sale
 * destination up the chain, then refreshes each chain owner's leaderboard
 * messages for the periods they have destinations for. No client PII is sent
 * (producer, AP, carrier only). Never throws: a Discord outage or a bad
 * destination must never block the producer's save.
 */
export async function notifyNewClient(clientId: string): Promise<void> {
  try {
    if (!clientId) return;
    const person = await getCurrentPerson();
    if (!person) return;

    const admin = createServiceRoleClient();
    const clientRes = await admin
      .from("clients")
      .select("annual_premium, quotes, chosen_quote_index, sale_status")
      .eq("id", clientId)
      .maybeSingle();
    const client = clientRes.data as {
      annual_premium: number | null;
      quotes: Array<{ carrier?: string }> | null;
      chosen_quote_index: number | null;
      sale_status: string;
    } | null;
    if (!client || client.sale_status !== "sale") return;

    const byOwner = await resolveDiscordDestinations(admin, person.id, ALL_DESTINATION_PURPOSES);
    if (!byOwner.size) return;

    const quotes = Array.isArray(client.quotes) ? client.quotes : [];
    const idx = client.chosen_quote_index ?? 0;
    const carrier = quotes[idx]?.carrier?.trim() || null;
    const ap = Number(client.annual_premium) || 0;
    const sale: SaleMessageData = {
      producerName: person.full_name ?? "A producer",
      apStr: ap.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
      carrier,
    };

    // 1) Sale celebration to every enabled sales destination in the chain.
    for (const byPurpose of byOwner.values()) {
      for (const dest of byPurpose.get("sale_submitted") ?? []) {
        await sendSaleSubmittedMessage(dest, sale);
      }
    }

    // 2) Refresh each distinct owner's team leaderboards, computed once per
    //    owner and only for the periods they actually have destinations for.
    for (const [ownerId, byPurpose] of byOwner) {
      const targets: Array<{ dest: NotificationDestination; period: DiscordPeriod }> = [];
      for (const [purpose, list] of byPurpose) {
        const period = PURPOSE_TO_PERIOD[purpose];
        if (!period) continue;
        for (const dest of list) targets.push({ dest, period });
      }
      if (!targets.length) continue;
      try {
        const periods = Array.from(new Set(targets.map((t) => t.period)));
        const boards = await computeSubmittedApTeamLeaderboards(admin, {
          ownerPersonId: ownerId,
          periods,
        });
        for (const { dest, period } of targets) {
          const board = boards.get(period);
          if (!board) continue;
          await createOrUpdateLeaderboardMessage(
            admin,
            dest,
            period,
            { from: board.from, to: board.to },
            board.rows,
          );
        }
      } catch {
        // One owner's board failing must not block the other owners.
      }
    }
  } catch {
    // A Discord outage must never block the producer's save.
  }
}
