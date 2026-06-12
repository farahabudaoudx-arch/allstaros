import { defineConfig } from "vitest/config";
import path from "node:path";

// Targeted unit tests (PRE_LAUNCH_ROADMAP §1 #7) on the highest-stakes pure
// logic — underwriting build knockouts + carrier-matrix matching, and the AI
// cost math. Node env; the `@` alias mirrors tsconfig so lib imports resolve.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
