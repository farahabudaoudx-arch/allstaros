import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  ALL_DESTINATION_PURPOSES,
  isDiscordWebhook,
  maskWebhookUrl,
  type DestinationPurpose,
} from "@/lib/actions/discord";
import type { Person } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";
import { PRODUCER_API_ERROR_COPY } from "@/lib/producer/error-copy";

type DestinationRow = {
  id: string;
  owner_person_id: string;
  purpose: DestinationPurpose;
  label: string | null;
  url: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

const DESTINATION_COLUMNS = "id, owner_person_id, purpose, label, url, enabled, created_at, updated_at";

// The webhook URL never leaves the server after save; responses only carry a
// masked version.
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

// Load the destination and enforce ownership (owner, or an admin caller).
// Returns the row, or a NextResponse to send straight back.
async function loadOwnedDestination(
  admin: SupabaseClient,
  id: string,
  person: Person,
): Promise<DestinationRow | NextResponse> {
  const { data, error } = await admin
    .from("notification_destinations")
    .select(DESTINATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const row = data as DestinationRow | null;
  if (!row) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  if (row.owner_person_id !== person.id && !person.is_admin && !person.is_super_admin)
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  return row;
}

// PATCH /api/producer/discord/destinations/[id]
// Update label, purpose, enabled, and/or url on an owned destination.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!person.is_builder && !person.is_admin && !person.is_super_admin)
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if ("label" in body) update.label = String(body.label ?? "").trim() || null;
  if ("enabled" in body) update.enabled = Boolean(body.enabled);
  if ("purpose" in body) {
    const purpose = String(body.purpose ?? "");
    if (!ALL_DESTINATION_PURPOSES.includes(purpose as DestinationPurpose))
      return NextResponse.json({ ok: false, error: "invalid purpose" }, { status: 400 });
    update.purpose = purpose;
  }
  if ("url" in body) {
    const url = String(body.url ?? "").trim();
    if (!isDiscordWebhook(url))
      return NextResponse.json(
        { ok: false, error: "URL must be a Discord webhook (https://discord.com/api/webhooks/...)" },
        { status: 400 },
      );
    update.url = url;
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });

  try {
    const admin = createServiceRoleClient();
    const rowOrRes = await loadOwnedDestination(admin, id, person);
    if (rowOrRes instanceof NextResponse) return rowOrRes;

    const { data, error } = await admin
      .from("notification_destinations")
      .update(update)
      .eq("id", id)
      .select(DESTINATION_COLUMNS)
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, destination: maskedDestination(data as DestinationRow) });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/discord/destinations/[id]",
      queryPhase: "discord",
      clientMessage: PRODUCER_API_ERROR_COPY,
    });
  }
}

// DELETE /api/producer/discord/destinations/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!person.is_builder && !person.is_admin && !person.is_super_admin)
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    const admin = createServiceRoleClient();
    const rowOrRes = await loadOwnedDestination(admin, id, person);
    if (rowOrRes instanceof NextResponse) return rowOrRes;

    const { error } = await admin.from("notification_destinations").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/discord/destinations/[id]",
      queryPhase: "discord",
      clientMessage: PRODUCER_API_ERROR_COPY,
    });
  }
}
