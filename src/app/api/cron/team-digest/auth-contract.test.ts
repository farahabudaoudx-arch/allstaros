import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src", "app", "api", "cron", "team-digest", "route.ts"),
  "utf8",
);

describe("team digest cron auth contract", () => {
  it("uses the fail-closed shared bearer guard and never reads a query-string secret", () => {
    expect(source).toContain("authorizeCronRequest(request)");
    expect(source).not.toContain('searchParams.get("key")');
    expect(source).not.toContain("!expected ||");
  });
});
