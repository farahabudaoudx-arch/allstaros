import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src", "lib", "whitelabel", "provisioning", "orchestrator.ts"),
  "utf8",
);

describe("Ticket 4 provisioning integration", () => {
  it("writes customer-local non-secret service bindings", () => {
    expect(source).toContain("installation_service_binding");
    expect(source).toContain("JSON.stringify(aiService.configuration ?? {})");
    expect(source).toContain("JSON.stringify(videoService.configuration ?? {})");
  });

  it("injects AI/video credentials only through deployment environment values", () => {
    expect(source).toContain('key: "ANTHROPIC_API_KEY"');
    expect(source).toContain('"BUNNY_RECRUITING"');
    expect(source).toContain('key: `${prefix}_API_KEY`');
    expect(source).toContain("sensitive: true");
    expect(source).toContain('key: "INSTALLATION_AI_PROVIDER"');
    expect(source).toContain('key: "INSTALLATION_VIDEO_PROVIDER"');
  });

  it("installs generic customer collection names instead of All Star collection names", () => {
    expect(source).toContain('key: "INSTALLATION_VIDEO_COLLECTION_AGENT_VLOGS", value: "Agent Vlogs"');
    expect(source).toContain('key: "INSTALLATION_VIDEO_COLLECTION_LIVE_DIALS", value: "Live Dials"');
    expect(source).toContain('key: "INSTALLATION_VIDEO_COLLECTION_CASE_STUDIES", value: "Case Studies"');
  });
});
