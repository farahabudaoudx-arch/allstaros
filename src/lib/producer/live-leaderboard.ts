import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSubmittedApScopedLeaderboards,
  DISCORD_LEADERBOARD_TZ,
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

export type LiveLeaderboardSnapshot = {
  scope: LiveLeaderboardScope;
  asOf: string;
  range: { from: string; to: string };
  totals: { submitted_ap_cents: number; deals: number; people: number };
  rows: Array<{
    full_name: string;
    submitted_ap_cents: number;
    sales_count: number;
  }>;
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

export async function buildLiveLeaderboardSnapshot(
  admin: SupabaseClient,
  capability: LiveLeaderboardCapability,
): Promise<LiveLeaderboardSnapshot> {
  // Scope is fixed in the capability. Team membership follows the current recruiting tree.
  const boards = await computeSubmittedApScopedLeaderboards(admin, {
    scope: scopeForComputation(capability),
    periods: ["daily"],
    tz: LIVE_LEADERBOARD_TZ,
  });
  const daily = boards.get("daily");
  if (!daily) throw new Error("missing_daily_live_leaderboard");
  const submittedApCents = daily.rows.reduce((sum, row) => sum + row.submitted_ap_cents, 0);
  const deals = daily.rows.reduce((sum, row) => sum + row.sales_count, 0);
  return {
    scope: capability.scope,
    asOf: new Date().toISOString(),
    range: { from: daily.from, to: daily.to },
    totals: { submitted_ap_cents: submittedApCents, deals, people: daily.rows.length },
    rows: daily.rows.map(({ full_name, submitted_ap_cents, sales_count }) => ({
      full_name,
      submitted_ap_cents,
      sales_count,
    })),
  };
}
