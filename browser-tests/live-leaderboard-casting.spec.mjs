import { expect, test } from "@playwright/test";

const BASE_URL = process.env.BROWSER_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3101";
const TEAM_TOKEN = "ll_" + "t".repeat(43);
const ORG_TOKEN = "ll_" + "o".repeat(43);
const TEAM_URL = `${BASE_URL}/live/leaderboard#${TEAM_TOKEN}`;
const ORG_URL = `${BASE_URL}/live/leaderboard#${ORG_TOKEN}`;

function liveSnapshot(scope = "team") {
  return {
    ok: true,
    scope,
    asOf: "2026-09-10T18:30:00.000Z",
    shop_day: "2026-09-10",
    range: { from: "2026-09-10", to: "2026-09-10" },
    totals: {
      submitted_ap_cents: 75000,
      deals: 1,
      people: 1,
      average_ticket_cents: 75000,
    },
    periods: {
      week: { range: { from: "2026-09-07", to: "2026-09-10" }, submitted_ap_cents: 75000, deals: 1 },
      month: { range: { from: "2026-09-01", to: "2026-09-10" }, submitted_ap_cents: 75000, deals: 1 },
    },
    rows: [
      { full_name: "Sarah Agent", photo_url: null, submitted_ap_cents: 75000, sales_count: 1 },
    ],
    events: [],
  };
}

async function installFakePresentationApi(context) {
  await context.addInitScript(() => {
    window.__presentationUrls = [];
    window.__presentationStarts = 0;
    window.__presentationReconnects = 0;
    window.__presentationTerminates = 0;
    window.__castRejectStart = false;

    class FakePresentationConnection extends EventTarget {
      constructor(id) {
        super();
        this.id = id;
        this.state = "connected";
      }

      close() {
        this.state = "closed";
        this.dispatchEvent(new Event("close"));
      }

      terminate() {
        window.__presentationTerminates += 1;
        this.state = "terminated";
        this.dispatchEvent(new Event("terminate"));
      }
    }

    class FakePresentationRequest {
      constructor(urls) {
        this.urls = urls;
        window.__presentationUrls.push([...urls]);
      }

      async start() {
        window.__presentationStarts += 1;
        if (window.__castRejectStart) {
          throw new DOMException("No display selected", "NotFoundError");
        }
        const connection = new FakePresentationConnection(`cast-${window.__presentationStarts}`);
        window.__castConnection = connection;
        return connection;
      }

      async reconnect(connectionId) {
        window.__presentationReconnects += 1;
        const connection = new FakePresentationConnection(connectionId);
        window.__castConnection = connection;
        return connection;
      }
    }

    Object.defineProperty(window, "PresentationRequest", {
      configurable: true,
      value: FakePresentationRequest,
    });
  });
}

async function routeLiveSnapshot(context, scope = "team") {
  await context.route("**/api/live-leaderboard/snapshot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(liveSnapshot(scope)),
    });
  });
}

test("Live preview uses the exact capability URL for browser casting and supports reconnect/stop", async ({ page, context }) => {
  test.setTimeout(75_000);
  await installFakePresentationApi(context);
  await routeLiveSnapshot(context, "team");

  await page.goto(TEAM_URL, { waitUntil: "networkidle" });
  await expect(page.getByText("Team Today", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Cast", exact: true }).click();
  await expect(page.getByText("Show this Live board on a TV", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "AirPlay", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Chromecast", exact: true }).click();

  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  const requestedUrl = await page.evaluate(() => window.__presentationUrls.at(-1)?.[0]);
  expect(requestedUrl).toBe(TEAM_URL);
  expect(await page.evaluate(() => window.__presentationStarts)).toBe(1);
  await expect(page.getByText("Team Today", { exact: true })).toBeVisible();

  await page.evaluate(() => window.__castConnection.dispatchEvent(new Event("close")));
  await expect(page.getByText(/cast connection closed/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__presentationReconnects)).toBe(1);

  await page.getByRole("button", { name: "Stop casting", exact: true }).click();
  await expect(page.getByText(/Casting stopped/i)).toBeVisible();
  expect(await page.evaluate(() => window.__presentationTerminates)).toBe(1);

  await page.getByRole("button", { name: "AirPlay", exact: true }).click();
  await expect(page.getByText("AirPlay from iPhone / iPad", { exact: true })).toBeVisible();
  await expect(page.getByText(/Control Center.*Screen Mirroring/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
});

test("Cast failure keeps clear guidance and the browser-link fallback", async ({ page, context }) => {
  await installFakePresentationApi(context);
  await routeLiveSnapshot(context, "team");

  await page.goto(TEAM_URL, { waitUntil: "networkidle" });
  await expect(page.getByText("Team Today", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => { window.__castRejectStart = true; });

  await page.getByRole("button", { name: "Cast", exact: true }).click();
  await page.getByRole("button", { name: "Chromecast", exact: true }).click();
  await expect(page.getByText(/No cast display was selected/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose another TV", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
  await expect(page.getByText("Team Today", { exact: true })).toBeVisible();
});

test("Chrome without an in-page presentation picker shows the manual cast path", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "PresentationRequest", {
      configurable: true,
      value: undefined,
    });
  });
  await routeLiveSnapshot(context, "team");

  await page.goto(TEAM_URL, { waitUntil: "networkidle" });
  await expect(page.getByText("Team Today", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Cast", exact: true }).click();
  await page.getByRole("button", { name: "Chromecast", exact: true }).click();

  await expect(page.getByText("Manual browser cast path", { exact: true })).toBeVisible();
  await expect(page.getByText(/does not expose an in-page display picker/i)).toBeVisible();
  await expect(page.getByText(/choose Cast tab/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
});

test("Live sheet casting follows the currently selected scope and Preview exposes the same cast controls", async ({ page, context }) => {
  test.setTimeout(90_000);
  await installFakePresentationApi(context);

  const mintedScopes = [];
  await context.route("**/api/producer/live-leaderboard/capabilities", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, capabilities: [] }),
      });
      return;
    }

    const body = request.postDataJSON();
    const scope = body.scope === "organization" ? "organization" : "team";
    mintedScopes.push(scope);
    const url = scope === "organization" ? ORG_URL : TEAM_URL;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        capability: {
          id: `cap-${scope}`,
          creator_person_id: "person-cast",
          scope,
          created_at: "2026-09-10T18:30:00.000Z",
          revoked_at: null,
          rotated_from_id: null,
        },
        url,
      }),
    });
  });

  await context.route("**/api/live-leaderboard/snapshot", async (route) => {
    const token = new URL(route.request().url()).hash;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(liveSnapshot(token === `#${ORG_TOKEN}` ? "organization" : "team")),
    });
  });

  await page.goto(`${BASE_URL}/auth/dev/as?role=producer`, { waitUntil: "commit", timeout: 30_000 });
  await page.goto(`${BASE_URL}/producer/leaderboard`, { waitUntil: "networkidle", timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Leaderboard", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Live", exact: true }).click();

  const sheet = page.getByRole("dialog");
  const castSection = sheet.getByLabel("Cast Live Leaderboard");
  await sheet.getByRole("button", { name: "Team", exact: true }).click();
  await expect(castSection.getByRole("button", { name: "Chromecast", exact: true })).toBeDisabled();
  await sheet.getByRole("button", { name: "Create Team link", exact: true }).click();
  await expect(castSection.getByRole("button", { name: "Chromecast", exact: true })).toBeEnabled();

  await castSection.getByRole("button", { name: "Chromecast", exact: true }).click();
  await expect(castSection.getByText("Connected", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__presentationUrls.at(-1)?.[0])).toBe(TEAM_URL);
  await castSection.getByRole("button", { name: "Stop casting", exact: true }).click();

  const previewPromise = page.waitForEvent("popup");
  await sheet.getByRole("link", { name: "Preview", exact: true }).click();
  const preview = await previewPromise;
  await preview.waitForLoadState("networkidle");
  await expect(preview.getByRole("button", { name: "Cast", exact: true })).toBeVisible({ timeout: 30_000 });
  await preview.close();

  await sheet.getByRole("button", { name: "Organization", exact: true }).click();
  await expect(castSection.getByRole("button", { name: "Chromecast", exact: true })).toBeDisabled();
  await sheet.getByRole("button", { name: "Create Organization link", exact: true }).click();
  await castSection.getByRole("button", { name: "Chromecast", exact: true }).click();
  await expect(castSection.getByText("Connected", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__presentationUrls.at(-1)?.[0])).toBe(ORG_URL);
  expect(mintedScopes).toEqual(["team", "organization"]);
});
