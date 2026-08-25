import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Static audit for #008: the public home route must not mutate frozen props/state
 * arrays in first-party source. Extension noise is filtered in sentry-runtime.
 */
describe("home route first-party audit (#008)", () => {
  const root = path.join(process.cwd(), "src");

  function read(rel: string): string {
    return fs.readFileSync(path.join(root, rel), "utf8");
  }

  it("page.tsx and its direct client children avoid in-place array mutation", () => {
    const files = ["app/page.tsx", "components/HeroVideo.tsx", "components/SignInModal.tsx"];
    const forbidden = /\.(push|sort|reverse|splice)\s*\(/;

    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toMatch(forbidden);
    }
  });
});
