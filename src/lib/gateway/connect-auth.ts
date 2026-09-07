import { createHmac } from "node:crypto";

export function gatewayConnectSignature(args: {
  connectToken: string;
  state: string;
  callbackUrl: string;
  expiresAt: string;
}) {
  if (!args.connectToken?.trim()) throw new Error("Gateway hosted connector signing is not configured.");
  const canonical = [
    "allstar-gateway-connect-v1",
    args.state,
    args.callbackUrl,
    args.expiresAt,
  ].join("\n");
  return createHmac("sha256", args.connectToken)
    .update(canonical)
    .digest("base64url");
}
