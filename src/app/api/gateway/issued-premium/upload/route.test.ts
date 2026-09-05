import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("retired agency-wide Gateway upload", () => {
  it("returns gone without requiring or accepting legacy upload credentials", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "agency_gateway_upload_retired",
    });
  });

  it("ignores legacy agency CSV payloads and never imports them", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "agency_gateway_upload_retired",
    });
  });
});
