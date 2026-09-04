import { NextRequest, NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import {
  createGatewayConnectRequest,
  failGatewayConnectRequest,
  gatewayHostedConnectUrl,
} from "@/lib/gateway/connection";

function safeReturnTo(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "/producer?settings=gateway";
  return path.startsWith("/producer") ? path : "/producer?settings=gateway";
}

export async function POST(request: NextRequest) {
  const person = await getCurrentPerson();
  if (!person) {
    return NextResponse.redirect(new URL("/auth/signin?next=/producer", request.url), 303);
  }
  if (person.status !== "active" || (!person.is_producer && !person.is_builder)) {
    return NextResponse.json({ error: "not_eligible" }, { status: 403 });
  }

  const form = await request.formData().catch(() => new FormData());
  const returnTo = safeReturnTo(form.get("returnTo"));
  let attempt: Awaited<ReturnType<typeof createGatewayConnectRequest>>;
  try {
    attempt = await createGatewayConnectRequest(person.id);
  } catch {
    const target = new URL("/producer", request.url);
    target.searchParams.set("settings", "gateway");
    target.searchParams.set("gatewayError", "start_failed");
    return NextResponse.redirect(target, 303);
  }

  // DEV QA uses an All Star OS-hosted mock page. It proves product states and
  // the optional Gateway-requested 2FA branch without touching a real Gateway
  // login, password, cookie, or production Mac agent.
  if (process.env.NODE_ENV === "development" && process.env.DEV_LOGIN_ENABLED === "true") {
    const target = new URL("/producer/gateway/connect/mock", request.url);
    target.searchParams.set("state", attempt.state);
    target.searchParams.set("next", returnTo);
    return NextResponse.redirect(target, 303);
  }

  const hostedBase = process.env.GATEWAY_HOSTED_CONNECT_URL;
  if (!hostedBase) {
    await failGatewayConnectRequest(attempt.state, "hosted_connector_unavailable");
    const target = new URL("/producer", request.url);
    target.searchParams.set("settings", "gateway");
    target.searchParams.set("gatewayError", "connector_unavailable");
    return NextResponse.redirect(target, 303);
  }

  try {
    const callbackUrl = new URL("/api/gateway/connect/callback", request.url).toString();
    return NextResponse.redirect(
      gatewayHostedConnectUrl({ baseUrl: hostedBase, state: attempt.state, callbackUrl }),
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
