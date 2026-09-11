import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  buildLiveLeaderboardSnapshot,
  resolveLiveLeaderboardCapability,
} from "@/lib/producer/live-leaderboard";

export const dynamic = "force-dynamic";

function bearerToken(req: Request): string | null {
  const value = req.headers.get("authorization");
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      Vary: "Authorization",
    },
  });
}

export async function GET(req: Request) {
  const token = bearerToken(req);
  if (!token) return json({ ok: false, error: "missing_capability" }, 401);

  try {
    const admin = createServiceRoleClient();
    const resolved = await resolveLiveLeaderboardCapability(admin, token);
    if (resolved.status === "revoked") {
      return json({ ok: false, error: "revoked", message: "Ask for a new link." }, 410);
    }
    if (resolved.status === "invalid") {
      return json({ ok: false, error: "invalid", message: "Ask for a new link." }, 404);
    }

    const snapshot = await buildLiveLeaderboardSnapshot(admin, resolved.capability);
    return json({ ok: true, ...snapshot });
  } catch {
    return json({ ok: false, error: "live_leaderboard_unavailable" }, 500);
  }
}
