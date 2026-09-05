import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("retired agency-wide Gateway scrape cron", () => {
  it("is inert and returns gone even when legacy credentials are supplied", async () => {
    const response = await GET();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "agency_gateway_scrape_retired",
    });
  });
});
