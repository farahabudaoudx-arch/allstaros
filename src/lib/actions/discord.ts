"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Only ever POST to a real Discord webhook host — never an arbitrary URL.
function isDiscordWebhook(url: string): boolean {
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

// Walk up the upline chain from `startId` to the first person with a Discord
// webhook configured (a producer ping lands in their builder's channel; a
// builder who signs their own client pings their own channel).
type WebhookRow = { discord_webhook_url: string | null; upline_id: string | null };

async function resolveWebhook(admin: SupabaseClient, startId: string): Promise<string | null> {
  let current: string | null = startId;
  for (let i = 0; i < 10; i++) {
    if (!current) break;
    const personId: string = current;
    const result = await admin
      .from("person")
      .select("discord_webhook_url, upline_id")
      .eq("id", personId)
      .maybeSingle();
    const row = result.data as WebhookRow | null;
    if (!row) return null;
    if (row.discord_webhook_url && isDiscordWebhook(row.discord_webhook_url)) {
      return row.discord_webhook_url;
    }
    current = row.upline_id;
  }
  return null;
}

/**
 * Posts a "new client signed" celebration to the responsible builder's Discord
 * channel. Called from the client form right after a NEW sale is inserted.
 * No client PII is sent — just the producer, the AP, and the carrier. Silently
 * no-ops if the client isn't a sale or no webhook is configured up the chain.
 */
export async function notifyNewClient(clientId: string): Promise<void> {
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

  const webhook = await resolveWebhook(admin, person.id);
  if (!webhook) return;

  const quotes = Array.isArray(client.quotes) ? client.quotes : [];
  const idx = client.chosen_quote_index ?? 0;
  const carrier = quotes[idx]?.carrier?.trim();
  const ap = Number(client.annual_premium) || 0;
  const apStr = ap.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  let content = `🎉 **${person.full_name}** just signed a new client! ${apStr} AP`;
  if (carrier) content += ` · ${carrier}`;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    // A Discord outage must never block the producer's save.
  }
}
