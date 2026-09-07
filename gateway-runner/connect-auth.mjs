import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SIGNED_FUTURE_MS = 15 * 60_000;

function canonical({ state, callbackUrl, expiresAt }) {
  return ["allstar-gateway-connect-v1", state, callbackUrl, expiresAt].join("\n");
}

export function signGatewayConnectRequest({ secret, state, callbackUrl, expiresAt }) {
  if (!secret || !state || !callbackUrl || !expiresAt) throw new Error("Gateway connect signing input is incomplete.");
  return createHmac("sha256", secret)
    .update(canonical({ state, callbackUrl, expiresAt }))
    .digest("base64url");
}

export function verifyGatewayConnectRequest({
  secret,
  state,
  callbackUrl,
  expiresAt,
  signature,
  now = Date.now(),
}) {
  if (!secret || !state || !callbackUrl || !expiresAt || !signature) {
    return { ok: false, reason: "missing_signature_input" };
  }
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return { ok: false, reason: "invalid_expiry" };
  if (expires <= now) return { ok: false, reason: "expired" };
  if (expires - now > MAX_SIGNED_FUTURE_MS) return { ok: false, reason: "expiry_too_far" };

  const expected = signGatewayConnectRequest({ secret, state, callbackUrl, expiresAt });
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true, expiresAt: new Date(expires).toISOString() };
}

export const __test = { canonical, MAX_SIGNED_FUTURE_MS };
