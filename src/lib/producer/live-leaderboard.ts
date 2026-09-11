import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { approvedPhotoUrl } from "@/lib/headshots/photo";
import { dollarsToCents, isSale, saleDay, type ClientSaleFields } from "@/lib/producer/metrics";
import {
  computeSubmittedApScopedLeaderboards,
  DISCORD_LEADERBOARD_TZ,
  type SubmittedApLeaderboard,
  type SubmittedApLeaderboardScope,
} from "@/lib/producer/submitted-ap-leaderboard";

export const LIVE_LEADERBOARD_TZ = DISCORD_LEADERBOARD_TZ;
export type LiveLeaderboardScope = "team" | "organization";

export type LiveLeaderboardCapability = {
  id: string;
  creator_person_id: string;
  scope: LiveLeaderboardScope;
  created_at: string;
  revoked_at: string | null;
  rotated_from_id: string | null;
};

type CapabilityRow = LiveLeaderboardCapability & { token_hash: string };

export type LiveLeaderboardDealEvent = {
  id: string;
  display_name: string;
  submitted_ap_cents: number;
  occurred_at: string | null;
};

export type LiveLeaderboardSnapshot = {
  scope: LiveLeaderboardScope;
  asOf: string;
  shop_day: string;
  range: { from: string; to: string };
  totals: {
    submitted_ap_cents: number;
    deals: number;
    people: number;
    average_ticket_cents: number;
  };
  periods: {
    week: { range: { from: string; to: string }; submitted_ap_cents: number; deals: number };
    month: { range: { from: string; to: string }; submitted_ap_cents: number; deals: number };
  };
  rows: Array<{
    full_name: string;
    photo_url: string | null;
    submitted_ap_cents: number;
    sales_count: number;
  }>;
  events: LiveLeaderboardDealEvent[];
};

const TOKEN_PREFIX = "ll_";
const TOKEN_RE = /^ll_[A-Za-z0-9_-]{43}$/;

export function createLiveLeaderboardToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashLiveLeaderboardToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isPresentedTokenValid(token: string): boolean {
  return TOKEN_RE.test(token);
}

function scopeForComputation(
  capability: Pick<LiveLeaderboardCapability, "scope" | "creator_person_id">,
): SubmittedApLeaderboardScope {
  return capability.scope === "team"
    ? { kind: "team", ownerPersonId: capability.creator_person_id }
    : { kind: "organization" };
}

function toCapability(row: CapabilityRow): LiveLeaderboardCapability {
  return {
    id: row.id,
    creator_person_id: row.creator_person_id,
    scope: row.scope,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
    rotated_from_id: row.rotated_from_id,
  };
}

export async function listLiveLeaderboardCapabilities(
  admin: SupabaseClient,
  creatorPersonId: string,
): Promise<LiveLeaderboardCapability[]> {
  const { data, error } = await admin
    .from("live_leaderboard_capability")
    .select("id, creator_person_id, scope, token_hash, created_at, revoked_at, rotated_from_id")
    .eq("creator_person_id", creatorPersonId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CapabilityRow[]).map(toCapability);
}

export async function mintLiveLeaderboardCapability(
  admin: SupabaseClient,
  creatorPersonId: string,
  scope: LiveLeaderboardScope,
  rotatedFromId: string | null = null,
): Promise<{ capability: LiveLeaderboardCapability; token: string }> {
  const token = createLiveLeaderboardToken();
  const tokenHash = hashLiveLeaderboardToken(token);
  const { data, error } = await admin
    .from("live_leaderboard_capability")
    .insert({
      creator_person_id: creatorPersonId,
      scope,
      token_hash: tokenHash,
      rotated_from_id: rotatedFromId,
    })
    .select("id, creator_person_id, scope, token_hash, created_at, revoked_at, rotated_from_id")
    .single();
  if (error) throw new Error(error.message);
  return { capability: toCapability(data as CapabilityRow), token };
}

export async function revokeLiveLeaderboardCapability(
  admin: SupabaseClient,
  creatorPersonId: string,
  capabilityId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("live_leaderboard_capability")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", capabilityId)
    .eq("creator_person_id", creatorPersonId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function rotateLiveLeaderboardCapability(
  admin: SupabaseClient,
  creatorPersonId: string,
  capabilityId: string,
): Promise<{ capability: LiveLeaderboardCapability; token: string } | null> {
  const token = createLiveLeaderboardToken();
  const tokenHash = hashLiveLeaderboardToken(token);
  const { data, error } = await admin.rpc("rotate_live_leaderboard_capability", {
    p_capability_id: capabilityId,
    p_creator_person_id: creatorPersonId,
    p_new_token_hash: tokenHash,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { capability: toCapability(row as CapabilityRow), token };
}

export async function resolveLiveLeaderboardCapability(
  admin: SupabaseClient,
  token: string,
): Promise<
  | { status: "active"; capability: LiveLeaderboardCapability }
  | { status: "revoked" }
  | { status: "invalid" }
> {
  if (!isPresentedTokenValid(token)) return { status: "invalid" };
  const { data, error } = await admin
    .from("live_leaderboard_capability")
    .select("id, creator_person_id, scope, token_hash, created_at, revoked_at, rotated_from_id")
    .eq("token_hash", hashLiveLeaderboardToken(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { status: "invalid" };
  const row = data as CapabilityRow;
  if (row.revoked_at) return { status: "revoked" };
  return { status: "active", capability: toCapability(row) };
}

type LivePhotoRow = {
  id: string;
  photo_url: string | null;
  photo_review_status: string | null;
};

function summarizeSubmittedPeriod(board: SubmittedApLeaderboard) {
  return {
    range: { from: board.from, to: board.to },
    submitted_ap_cents: board.rows.reduce((sum, row) => sum + row.submitted_ap_cents, 0),
    deals: board.rows.reduce((sum, row) => sum + row.sales_count, 0),
  };
}

async function loadApprovedLivePhotos(
  admin: SupabaseClient,
  personIds: string[],
): Promise<Map<string, string | null>> {
  const photos = new Map<string, string | null>();
  const uniqueIds = Array.from(new Set(personIds));
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const ids = uniqueIds.slice(index, index + 100);
    const { data, error } = await admin
      .from("person")
      .select("id, photo_url, photo_review_status")
      .in("id", ids);
    // Photos are presentation-only: if this lookup fails, keep the accurate board
    // available and let the Avatar fall back to initials.
    if (error) continue;
    for (const row of (data ?? []) as LivePhotoRow[]) {
      photos.set(row.id, approvedPhotoUrl(row));
    }
  }
  return photos;
}

type LiveDealClientRow = ClientSaleFields & {
  id: string;
  person_id: string;
};

function stableLiveDealEventId(capabilityId: string, clientId: string): string {
  return "lde_" + createHash("sha256")
    .update(capabilityId + "\0" + clientId)
    .digest("base64url");
}

async function loadLiveDealEvents(
  admin: SupabaseClient,
  capabilityId: string,
  daily: SubmittedApLeaderboard,
): Promise<LiveLeaderboardDealEvent[]> {
  if (daily.rows.length === 0) return [];
  const nameByPersonId = new Map(daily.rows.map((row) => [row.person_id, row.full_name]));
  const personIds = Array.from(nameByPersonId.keys());
  const events: LiveLeaderboardDealEvent[] = [];

  for (let partIndex = 0; partIndex < personIds.length; partIndex += 100) {
    const part = personIds.slice(partIndex, partIndex + 100);
    let offset = 0;
    while (true) {
      const { data, error } = await admin
        .from("clients")
        .select("id, person_id, annual_premium, sale_status, submit_date, date, created_at")
        .in("person_id", part)
        .or("sale_status.eq.sale,sale_status.is.null")
        .or("submit_date.gte." + daily.from + ",submit_date.is.null")
        .order("id")
        .range(offset, offset + 999);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as LiveDealClientRow[];
      for (const row of rows) {
        if (!isSale(row) || saleDay(row, LIVE_LEADERBOARD_TZ) !== daily.from) continue;
        const displayName = nameByPersonId.get(row.person_id);
        if (!displayName) continue;
        events.push({
          id: stableLiveDealEventId(capabilityId, row.id),
          display_name: displayName,
          submitted_ap_cents: dollarsToCents(row.annual_premium),
          occurred_at: row.created_at,
        });
      }
      if (rows.length < 1000) break;
      offset += 1000;
    }
  }

  events.sort((left, right) => {
    const timeOrder = (left.occurred_at ?? "").localeCompare(right.occurred_at ?? "");
    return timeOrder || left.id.localeCompare(right.id);
  });
  return events;
}

export async function buildLiveLeaderboardSnapshot(
  admin: SupabaseClient,
  capability: LiveLeaderboardCapability,
): Promise<LiveLeaderboardSnapshot> {
  // Scope is fixed in the capability. Team membership follows the current recruiting tree.
  const boards = await computeSubmittedApScopedLeaderboards(admin, {
    scope: scopeForComputation(capability),
    periods: ["daily", "wtd", "mtd"],
    tz: LIVE_LEADERBOARD_TZ,
  });
  const daily = boards.get("daily");
  const week = boards.get("wtd");
  const month = boards.get("mtd");
  if (!daily || !week || !month) throw new Error("missing_live_leaderboard_period");

  const today = summarizeSubmittedPeriod(daily);
  const [photos, events] = await Promise.all([
    loadApprovedLivePhotos(admin, daily.rows.map((row) => row.person_id)),
    loadLiveDealEvents(admin, capability.id, daily),
  ]);
  const averageTicketCents =
    today.deals > 0 ? Math.round(today.submitted_ap_cents / today.deals) : 0;

  return {
    scope: capability.scope,
    asOf: new Date().toISOString(),
    shop_day: daily.to,
    range: today.range,
    totals: {
      submitted_ap_cents: today.submitted_ap_cents,
      deals: today.deals,
      people: daily.rows.length,
      average_ticket_cents: averageTicketCents,
    },
    periods: {
      week: summarizeSubmittedPeriod(week),
      month: summarizeSubmittedPeriod(month),
    },
    rows: daily.rows.map(({ person_id, full_name, submitted_ap_cents, sales_count }) => ({
      full_name,
      photo_url: photos.get(person_id) ?? null,
      submitted_ap_cents,
      sales_count,
    })),
    events,
  };
}
