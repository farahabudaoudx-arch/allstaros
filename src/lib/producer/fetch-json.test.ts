import { describe, expect, it } from "vitest";
import { parseJsonResponse } from "./fetch-json";

describe("parseJsonResponse", () => {
  it("rejects non-JSON 200 responses with the friendly fallback message", async () => {
    const res = new Response("<html>bad</html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    await expect(parseJsonResponse(res, "Please try again.")).rejects.toThrow("Please try again.");
  });

  it("rejects non-OK JSON responses without exposing server exception text", async () => {
    const res = new Response(JSON.stringify({ ok: false, error: "SQLSTATE ... statement timeout" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });

    await expect(parseJsonResponse(res, "We couldn't save your tracker update. Please try again.")).rejects.toThrow(
      "We couldn't save your tracker update. Please try again.",
    );
  });

  it("accepts valid JSON responses", async () => {
    const res = new Response(JSON.stringify({ ok: true, entry: { dials: 3 } }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });

    await expect(parseJsonResponse(res, "Please try again.")).resolves.toEqual({ ok: true, entry: { dials: 3 } });
  });
});
