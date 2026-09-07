import { NextRequest, NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import {
  createGatewayConnectRequest,
  failGatewayConnectRequest,
  gatewayHostedConnectUrl,
} from "@/lib/gateway/connection";

export async function POST(request: NextRequest) {
  const person = await getCurrentPerson();
  if (!person) {
    return NextResponse.redirect(new URL("/auth/signin?next=/producer", request.url), 303);
  }
  if (person.status !== "active" || (!person.is_producer && !person.is_builder)) {
    return NextResponse.json({ error: "not_eligible" }, { status: 403 });
  }

  let attempt: Awaited<ReturnType<typeof createGatewayConnectRequest>>;
  try {
    attempt = await createGatewayConnectRequest(person.id);
  } catch {
    const target = new URL("/producer", request.url);
    target.searchParams.set("settings", "gateway");
    target.searchParams.set("gatewayError", "start_failed");
    return NextResponse.redirect(target, 303);
  }

  const hostedBase = process.env.GATEWAY_HOSTED_CONNECT_URL;
  const connectToken = process.env.GATEWAY_AGENT_CONNECT_TOKEN;
  if (!hostedBase || !connectToken) {
    await failGatewayConnectRequest(attempt.state, "hosted_connector_unavailable");
    const target = new URL("/producer", request.url);
    target.searchParams.set("settings", "gateway");
    target.searchParams.set("gatewayError", "connector_unavailable");
    return NextResponse.redirect(target, 303);
  }

  try {
    const callbackUrl = new URL("/api/gateway/connect/callback", request.url).toString();
    return NextResponse.redirect(
      gatewayHostedConnectUrl({
        baseUrl: hostedBase,
        state: attempt.state,
        callbackUrl,
        expiresAt: attempt.expiresAt,
        connectToken,
      }),
      303,
    );
  } catch {
    await failGatewayConnectRequest(attempt.state, "invalid_hosted_connector_url");
    const target = new URL("/producer", request.url);
    target.searchParams.set("settings", "gateway");
    target.searchParams.set("gatewayError", "connector_unavailable");
    return NextResponse.redirect(target, 303);
  }
}
