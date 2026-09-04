import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const chrome = read("src/components/producer/AppChrome.tsx");
const drawer = read("src/components/producer/menu/MenuSettingsDrawer.tsx");
const prompt = read("src/app/producer/_components/gateway-connect-prompt.tsx");
const settings = read("src/components/producer/GatewayConnectionSettings.tsx");
const home = read("src/app/producer/page.tsx");
const numbers = read("src/lib/producer/home-numbers.ts");
const issued = read("src/app/producer/(app)/issued-premium/page.tsx");
const scorecards = read("src/app/producer/(app)/scorecards/page.tsx");

describe("Gateway connection UI semantics", () => {
  it("wires Gateway into the shared producer chrome and settings deep-link", () => {
    expect(chrome).toContain('"gateway"');
    expect(chrome).toContain("shouldPromptGatewayConnection(person.gatewayConnection)");
    expect(drawer).toContain('key: "gateway"');
    expect(drawer).toContain("<GatewayConnectionSettings state={person.gatewayConnection} />");
  });

  it("keeps the first-open prompt dismissible without blocking the app permanently", () => {
    expect(prompt).toContain("I’ll do it later");
    expect(prompt).toContain("You can keep using the rest of All Star OS");
    expect(prompt).toContain('action="/api/gateway/connect/start"');
    expect(prompt).not.toMatch(/disable.{0,20}2FA/i);
  });

  it("offers connect/reconnect/disconnect and never asks All Star OS for a password or 2FA secret", () => {
    expect(settings).toContain("Disconnect Gateway");
    expect(settings).toContain("Reconnect Gateway");
    expect(settings).toContain("Connect Gateway");
    expect(settings).toContain("does not store your Gateway password or 2FA code");
    expect(settings).not.toContain('name="password"');
    expect(settings).not.toContain('name="twoFactorCode"');
  });

  it("renders Gateway-dependent home numbers as Unknown instead of falling back to the client book", () => {
    expect(home).toContain('return value == null ? "Unknown"');
    expect(numbers).toContain("ipCents: gatewayConnected ? (gateway?.personalCents ?? null) : null");
    expect(numbers).toContain("teamIpCents: gatewayConnected ? (gateway?.teamCents ?? null) : null");
    const producer = numbers.slice(numbers.indexOf("export async function producerYtd"), numbers.indexOf("export async function downlineIds"));
    expect(producer).not.toContain("totals.ip_cents");
  });

  it("does not read legacy Issued Premium rows when the personal Gateway is disconnected", () => {
    expect(issued).toContain("if (gatewayConnection.connected)");
    expect(issued).toContain("Current Gateway-dependent values stay unknown until you reconnect.");
    expect(issued).toContain("cannot report your personal Issued Premium until you connect your own Gateway login");
    expect(issued).toContain("hiding the values instead of substituting zero or stale data");
  });

  it("leaves the frozen published Scorecard archive independent from Gateway connection state", () => {
    expect(scorecards).toContain("scorecard_snapshot");
    expect(scorecards).not.toContain("gateway_connection");
    expect(scorecards).not.toContain("GatewayConnection");
  });
});