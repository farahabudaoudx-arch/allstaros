import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  ALL_DESTINATION_PURPOSES,
  isDiscordWebhook,
  maskWebhookUrl,
  type DestinationPurpose,
} from "@/lib/actions/discord";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";
import { PRODUCER_API_ERROR_COPY } from "@/lib/producer/error-copy";

type DestinationRow = {
  id: string;
  purpose: DestinationPurpose;
  label: string | null;
  url: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

// The webhook URL never leaves the server after save; list responses only
// carry a masked version.
function maskedDestination(row: DestinationRow) {
  return {
    id: row.id,
    purpose: row.purpose,
    label: row.label,
    enabled: row.enabled,
    masked_url: maskWebhookUrl(row.url),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// GET /api/producer/discord/destinations
// The current builder's own webhook destinations, URLs masked.
export async function GET() {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!person.is_builder && !person.is_admin && !person.is_super_admin)
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("notification_destinations")
      .select("id, purpose, label, url, enabled, created_at, updated_at")
      .eq("owner_person_id", person.id)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const destinations = ((data ?? []) as DestinationRow[]).map(maskedDestination);
    return NextResponse.json({ ok: true, destinations });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/discord/destinations",
      queryPhase: "discord",
      clientMessage: PRODUCER_API_ERROR_COPY,
    });
  }
}

// POST /api/producer/discord/destinations
// Create a destination owned by the current person. Body: { purpose, label, url, enabled? }.
export async function POST(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!person.is_builder && !person.is_admin && !person.is_super_admin)
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const purpose = String(body.purpose ?? "");
  if (!ALL_DESTINATION_PURPOSES.includes(purpose as DestinationPurpose))
    return NextResponse.json({ ok: false, error: "invalid purpose" }, { status: 400 });

  const url = String(body.url ?? "").trim();
  if (!isDiscordWebhook(url))
    return NextResponse.json(
      { ok: false, error: "URL must be a Discord webhook (https://discord.com/api/webhooks/...)" },
      { status: 400 },
    );

  const label = String(body.label ?? "").trim() || null;
  const enabled = "enabled" in body ? Boolean(body.enabled) : true;

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("notification_destinations")
      .insert({
        owner_person_id: person.id,
        created_by: person.id,
        provider: "discord_webhook",
        purpose,
        label,
        url,
        enabled,
      })
      .select("id, purpose, label, url, enabled, created_at, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, destination: maskedDestination(data as DestinationRow) });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/discord/destinations",
      queryPhase: "discord",
      clientMessage: PRODUCER_API_ERROR_COPY,
    });
  }
}
