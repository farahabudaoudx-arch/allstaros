import { defineConfig } from "@playwright/test";

const baseURL = process.env.BROWSER_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3101";
const webServer = process.env.BROWSER_ACCEPTANCE_BASE_URL
  ? undefined
  : {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3101",
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
    };

export default defineConfig({
  testDir: "./browser-tests",
  timeout: 60_000,
  workers: 1,
  reporter: "line",
  outputDir: "test-results/browser",
  webServer,
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
