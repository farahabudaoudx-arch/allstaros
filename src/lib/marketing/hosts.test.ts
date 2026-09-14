import { afterEach, describe, expect, it } from "vitest";
import { isMarketingHostname, requestHostname } from "./hosts";

describe("marketing hostname routing", () => {
  const originalHosts = process.env.MARKETING_HOSTS;

  afterEach(() => {
    if (originalHosts === undefined) delete process.env.MARKETING_HOSTS;
    else process.env.MARKETING_HOSTS = originalHosts;
  });

  it.each([
    "allstarlifegroup.com",
    "www.allstarlifegroup.com",
    "marketing.localhost",
  ])("routes %s to the marketing site", (hostname) => {
    expect(isMarketingHostname(hostname)).toBe(true);
  });

  it("never routes the app subdomain to marketing", () => {
    expect(isMarketingHostname("app.allstarlifegroup.com")).toBe(false);
  });

  it("normalizes a host header with a development port", () => {
    expect(requestHostname("WWW.ALLSTARLIFEGROUP.COM:3003", "localhost")).toBe(
      "www.allstarlifegroup.com",
    );
  });

  it("uses installation-specific marketing hosts when configured", () => {
    process.env.MARKETING_HOSTS = "agency.example.com,www.agency.example.com";
    expect(isMarketingHostname("agency.example.com")).toBe(true);
    expect(isMarketingHostname("allstarlifegroup.com")).toBe(false);
  });
});
