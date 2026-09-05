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
    expect(chrome).toContain("person.gatewayReminder?.id");
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
    expect(settings).toContain("We do not store your Gateway password or verification codes");
    expect(settings).toContain("run scheduled Gateway reports automatically");
    expect(settings).not.toContain('name="password"');
    expect(settings).not.toContain('name="twoFactorCode"');
  });

  it("renders Gateway-dependent home numbers as Unknown instead of falling back to the client book", () => {
    expect(home).toContain('return value == null ? "Unknown"');
    expect(home).toContain("gatewayConnectionNotice(gatewayConnection)");
    expect(numbers).toContain("ipCents: gatewayConnected ? (gateway?.personalCents ?? null) : null");
    expect(numbers).toContain("teamIpCents: gatewayConnected ? (gateway?.teamCents ?? null) : null");
    const producer = numbers.slice(numbers.indexOf("export async function producerYtd"), numbers.indexOf("export async function downlineIds"));
    expect(producer).not.toContain("totals.ip_cents");
  });

  it("hides leftover agency Issued Paid when never connected and keeps history after disconnect", () => {
    expect(issued).toContain("gatewayIssuedPaidHistoryVisible");
    expect(issued).toContain("GATEWAY_NEVER_CONNECTED_COPY");
    expect(issued).toContain("GATEWAY_RECONNECT_COPY");
    expect(issued).not.toContain("if (gatewayConnection.connected)");
  });

  it("gates Scorecards by personal Gateway connection without showing in-progress unpublished cards", () => {
    expect(scorecards).toContain("filterScorecardArchiveByGatewayConnection");
    expect(scorecards).toContain("GATEWAY_NEVER_CONNECTED_COPY");
    expect(scorecards).toContain("GATEWAY_SCORECARD_NOT_CREATED_COPY");
    expect(scorecards).not.toContain("in_progress");
  });
});
