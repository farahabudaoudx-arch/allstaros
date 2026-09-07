import { describe, expect, it } from "vitest";
import { gatewayConnectSignature } from "../src/lib/gateway/connect-auth.ts";
import { signGatewayConnectRequest, verifyGatewayConnectRequest } from "./connect-auth.mjs";

describe("Gateway hosted-connect signing contract", () => {
  const input = {
    state: "state-contract-1",
    callbackUrl: "https://app.example.test/api/gateway/connect/callback",
    expiresAt: "2026-09-07T13:10:00.000Z",
  };
  const secret = "connect-signing-secret-0123456789abcdef";

  it("uses the exact same signature contract in the Next app and Mac runner", () => {
    const appSignature = gatewayConnectSignature({ ...input, connectToken: secret });
    const runnerSignature = signGatewayConnectRequest({ ...input, secret });
    expect(appSignature).toBe(runnerSignature);
  });

  it("rejects tampering and expired signed requests", () => {
    const signature = signGatewayConnectRequest({ ...input, secret });
    expect(verifyGatewayConnectRequest({ ...input, secret, signature, now: Date.parse("2026-09-07T13:05:00.000Z") }).ok)
      .toBe(true);
    expect(verifyGatewayConnectRequest({ ...input, state: "changed", secret, signature, now: Date.parse("2026-09-07T13:05:00.000Z") }).ok)
      .toBe(false);
    expect(verifyGatewayConnectRequest({ ...input, secret, signature, now: Date.parse("2026-09-07T13:10:01.000Z") }).reason)
      .toBe("expired");
  });
});
