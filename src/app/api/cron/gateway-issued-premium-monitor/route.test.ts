import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("retired agency-wide Gateway monitor", () => {
  it("is inert and returns gone for legacy monitor requests", async () => {
    const response = await GET();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "agency_gateway_monitor_retired",
    });
  });
});
