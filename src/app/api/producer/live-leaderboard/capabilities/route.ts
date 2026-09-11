import { NextResponse } from "next/server";
import { canAccessProducerApp, getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  listLiveLeaderboardCapabilities,
  mintLiveLeaderboardCapability,
  revokeLiveLeaderboardCapability,
  rotateLiveLeaderboardCapability,
  type LiveLeaderboardScope,
} from "@/lib/producer/live-leaderboard";

function isScope(value: unknown): value is LiveLeaderboardScope {
  return value === "team" || value === "organization";
}

async function currentLeaderboardPerson() {
  const person = await getCurrentPerson();
  if (!person || !canAccessProducerApp(person)) return null;
  return person;
}

function capabilityUrl(req: Request, token: string): string {
  const origin = new URL(req.url).origin;
  const url = new URL("/live/leaderboard", origin);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("live_leaderboard_https_required");
  }
  url.hash = token;
  return url.toString();
}

export async function GET() {
  const person = await currentLeaderboardPerson();
  if (!person) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const admin = createServiceRoleClient();
    const capabilities = await listLiveLeaderboardCapabilities(admin, person.id);
    return NextResponse.json({ ok: true, capabilities });
  } catch {
    return NextResponse.json({ ok: false, error: "live_leaderboard_unavailable" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const person = await currentLeaderboardPerson();
  if (!person) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: { action?: unknown; scope?: unknown; capabilityId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = body.action;
  const admin = createServiceRoleClient();
  try {
    if (action === "mint") {
      if (!isScope(body.scope)) {
        return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
      }
      const minted = await mintLiveLeaderboardCapability(admin, person.id, body.scope);
      return NextResponse.json(
        { ok: true, capability: minted.capability, url: capabilityUrl(req, minted.token) },
        { status: 201 },
      );
    }

    if (action === "revoke") {
      if (typeof body.capabilityId !== "string" || !body.capabilityId) {
        return NextResponse.json({ ok: false, error: "invalid_capability" }, { status: 400 });
      }
      const revoked = await revokeLiveLeaderboardCapability(admin, person.id, body.capabilityId);
      if (!revoked) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    if (action === "rotate") {
      if (typeof body.capabilityId !== "string" || !body.capabilityId) {
        return NextResponse.json({ ok: false, error: "invalid_capability" }, { status: 400 });
      }
      const rotated = await rotateLiveLeaderboardCapability(admin, person.id, body.capabilityId);
      if (!rotated) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      return NextResponse.json({
        ok: true,
        capability: rotated.capability,
        url: capabilityUrl(req, rotated.token),
      });
    }

    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "live_leaderboard_unavailable" }, { status: 500 });
  }
}
