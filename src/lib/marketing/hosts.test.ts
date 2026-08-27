import { describe, expect, it } from "vitest";
import { isMarketingHostname, requestHostname } from "./hosts";

describe("marketing hostname routing", () => {
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
});
