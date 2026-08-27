import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("scorecard PNG download route", () => {
  it("returns a PNG as a named attachment", async () => {
    const form = new FormData();
    form.set("filename", "01 issued premium 9x16.png");
    form.set("png", `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`);

    const response = await POST(new Request("http://localhost/preview/scorecards/export-png", {
      method: "POST",
      body: form,
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="01-issued-premium-9x16.png"',
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("png-bytes");
  });

  it("rejects non-PNG form payloads", async () => {
    const form = new FormData();
    form.set("png", "not-an-image");
    const response = await POST(new Request("http://localhost/preview/scorecards/export-png", {
      method: "POST",
      body: form,
    }));
    expect(response.status).toBe(400);
  });
});
