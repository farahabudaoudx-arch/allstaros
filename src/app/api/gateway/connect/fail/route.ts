import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { failGatewayConnectRequest } from "@/lib/gateway/connection";

function authorized(request: NextRequest) {
  const expected = process.env.GATEWAY_AGENT_CONNECT_TOKEN;
  if (!expected) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: NextRequest) {
  if (!process.env.GATEWAY_AGENT_CONNECT_TOKEN) {
    return NextResponse.json({ error: "connector_callback_not_configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null) as { state?: unknown; error?: unknown } | null;
  const state = typeof payload?.state === "string" ? payload.state.trim() : "";
  const error = typeof payload?.error === "string" ? payload.error.trim() : "gateway_connect_failed";
  if (!state || state.length > 256 || !error || error.length > 120) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  await failGatewayConnectRequest(state, error);
  return NextResponse.json({ ok: true });
}
