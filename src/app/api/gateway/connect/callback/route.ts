import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { completeGatewayConnectRequest } from "@/lib/gateway/connection";

function authorized(request: NextRequest) {
  const expected = process.env.GATEWAY_AGENT_CONNECT_TOKEN;
  if (!expected) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Trusted hosted-runner -> All Star OS callback.
 *
 * The browser/member never marks itself connected in production. The external
 * runner must authenticate this callback and return only an opaque session
 * reference after Gateway sign-in (and Gateway-requested 2FA, when applicable)
 * actually succeeded.
 */
export async function POST(request: NextRequest) {
  if (!process.env.GATEWAY_AGENT_CONNECT_TOKEN) {
    return NextResponse.json({ error: "connector_callback_not_configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null) as
    | { state?: unknown; sessionRef?: unknown }
    | null;
  const state = typeof payload?.state === "string" ? payload.state : "";
  const sessionRef = typeof payload?.sessionRef === "string" ? payload.sessionRef : "";
  if (!state || !sessionRef || state.length > 256 || sessionRef.length > 2048) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    const personId = await completeGatewayConnectRequest(state, sessionRef);
    return NextResponse.json({ ok: true, personId });
  } catch {
    return NextResponse.json({ error: "connection_completion_rejected" }, { status: 409 });
  }
}
