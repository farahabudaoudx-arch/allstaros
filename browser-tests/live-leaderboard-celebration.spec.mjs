import { expect, test } from "@playwright/test";

const BASE_URL = process.env.BROWSER_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3101";
const TOKEN = "ll_" + "a".repeat(43);

const eventOne = {
  id: "lde_1111111111111111111111111111111111111111111",
  display_name: "Sarah Agent",
  submitted_ap_cents: 75000,
  carrier: "Mutual of Omaha",
  occurred_at: "2026-09-10T15:00:00.000Z",
};

const eventTwo = {
  id: "lde_2222222222222222222222222222222222222222222",
  display_name: "Jake Producer",
  submitted_ap_cents: 50000,
  carrier: null,
  occurred_at: "2026-09-10T15:01:00.000Z",
};

const eventThree = {
  id: "lde_3333333333333333333333333333333333333333333",
  display_name: "Alexandria Montgomery-Sutherland Senior Producer",
  submitted_ap_cents: 123456789,
  carrier: "North American Company for Life and Health Insurance",
  occurred_at: "2026-09-10T15:02:00.000Z",
};

function makeSnapshot(phase) {
  const empty = phase === 0;
  const twoDeals = phase >= 2;
  const threeDeals = phase >= 3;
  const rows = empty
    ? []
    : [
        { full_name: "Sarah Agent", photo_url: null, submitted_ap_cents: 75000, sales_count: 1 },
        ...(twoDeals
          ? [{ full_name: "Jake Producer", photo_url: null, submitted_ap_cents: 50000, sales_count: 1 }]
          : []),
        ...(threeDeals
          ? [{ full_name: eventThree.display_name, photo_url: null, submitted_ap_cents: eventThree.submitted_ap_cents, sales_count: 1 }]
          : []),
      ];
  const submitted = empty ? 0 : threeDeals ? 123581789 : twoDeals ? 125000 : 75000;
  const deals = empty ? 0 : threeDeals ? 3 : twoDeals ? 2 : 1;

  return {
    ok: true,
    scope: "team",
    asOf: new Date().toISOString(),
    shop_day: "2026-09-10",
    range: { from: "2026-09-10", to: "2026-09-10" },
    totals: {
      submitted_ap_cents: submitted,
      deals,
      people: rows.length,
      average_ticket_cents: deals ? Math.round(submitted / deals) : 0,
    },
    periods: {
      week: { range: { from: "2026-09-07", to: "2026-09-10" }, submitted_ap_cents: submitted, deals },
      month: { range: { from: "2026-09-01", to: "2026-09-10" }, submitted_ap_cents: submitted, deals },
    },
    rows,
    events: empty
      ? []
      : threeDeals
        ? [eventOne, eventTwo, eventThree]
        : twoDeals
          ? [eventOne, eventTwo]
          : [eventOne],
  };
}

async function installFakeAudio(page) {
  await page.addInitScript(() => {
    window.__gongStarts = 0;
    window.__throwGong = false;

    class FakeAudioContext {
      constructor() {
        this.state = "running";
        this.currentTime = 0;
        window.__audioContextInstance = this;
      }

      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {},
        };
      }

      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime() {} },
          detune: { setValueAtTime() {} },
          connect() {},
          start() {
            if (window.__throwGong) throw new Error("mock gong failure");
            window.__gongStarts += 1;
          },
          stop() {},
        };
      }

      async resume() {
        this.state = "running";
      }

      async close() {
        this.state = "closed";
      }
    }

    Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true });
  });
}

test("Live TV celebrations stay sequential, audio-safe, and fit 1080p/720p", async ({ page }) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installFakeAudio(page);

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  let phase = 0;
  let snapshotCalls = 0;
  await page.route("**/api/live-leaderboard/snapshot", async (route) => {
    snapshotCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeSnapshot(phase)),
    });
  });

  await page.goto(`${BASE_URL}/live/leaderboard#${TOKEN}`, { waitUntil: "networkidle" });
  await expect.poll(() => snapshotCalls, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.getByText("Team Today", { exact: true })).toBeVisible({ timeout: 30_000 });

  const soundUnlock = page.getByRole("button", { name: "Unlock Live Leaderboard sound" });
  await expect(soundUnlock).toBeVisible();
  await soundUnlock.focus();
  await soundUnlock.press("Enter");
  await expect(page.getByText("Sound on", { exact: true })).toBeVisible();

  phase = 1;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const celebration = page.getByLabel("New deal celebration");
  await expect(celebration.getByText("Sarah Agent", { exact: true })).toBeVisible({ timeout: 7_000 });
  await expect(celebration.getByText(/Deal Closed/)).toBeVisible();
  await expect(celebration.getByText("Mutual of Omaha", { exact: true })).toBeVisible();
  await expect(page.getByText("Team Today", { exact: true })).toBeVisible();

  const firstStartedAt = Date.now();
  expect(await page.evaluate(() => window.__gongStarts)).toBe(3);

  await page.evaluate(() => {
    window.__audioContextInstance.state = "suspended";
  });
  await page.locator("body").press("Enter");
  expect(await page.evaluate(() => window.__audioContextInstance.state)).toBe("running");
  expect(await page.evaluate(() => window.__gongStarts)).toBe(3);

  await page.getByRole("button", { name: "Turn Live Leaderboard sound off" }).click();
  await expect(page.getByText("Sound off", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("allstar-live-leaderboard-sound"))).toBe("off");

  phase = 2;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(celebration.getByText("Jake Producer", { exact: true })).toBeVisible({ timeout: 8_000 });
  const sequentialDelayMs = Date.now() - firstStartedAt;
  expect(sequentialDelayMs).toBeGreaterThanOrEqual(4_300);
  expect(sequentialDelayMs).toBeLessThanOrEqual(6_800);
  await expect(celebration.getByText("Mutual of Omaha", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__gongStarts)).toBe(3);

  await expect(celebration).toHaveCount(0, { timeout: 7_000 });
  await expect(page.getByText("Team Today", { exact: true })).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Team Today", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unlock Live Leaderboard sound" }).click();
  await expect(page.getByText("Sound off", { exact: true })).toBeVisible();
  await page.waitForTimeout(3_400);
  await expect(page.getByLabel("New deal celebration")).toHaveCount(0);

  await page.getByRole("button", { name: "Turn Live Leaderboard sound on" }).click();
  await expect(page.getByText("Sound on", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    window.__throwGong = true;
  });
  phase = 3;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(celebration.getByText(eventThree.display_name, { exact: true })).toBeVisible({ timeout: 7_000 });

  const compactLayout = await celebration.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      scrollHeight: element.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(compactLayout.left).toBeGreaterThanOrEqual(-1);
  expect(compactLayout.top).toBeGreaterThanOrEqual(-1);
  expect(compactLayout.right).toBeLessThanOrEqual(compactLayout.viewportWidth + 1);
  expect(compactLayout.bottom).toBeLessThanOrEqual(compactLayout.viewportHeight + 1);
  expect(compactLayout.scrollHeight).toBeLessThanOrEqual(compactLayout.viewportHeight + 1);
  expect(compactLayout.scrollWidth).toBeLessThanOrEqual(compactLayout.viewportWidth + 1);

  const overlayUnlock = celebration.getByRole("button", { name: "Enable sound · OK / click" });
  await expect(overlayUnlock).toBeVisible();
  const gongBeforeRecoveryUnlock = await page.evaluate(() => window.__gongStarts);
  await page.evaluate(() => {
    window.__throwGong = false;
  });
  await overlayUnlock.click();
  expect(await page.evaluate(() => window.__gongStarts)).toBe(gongBeforeRecoveryUnlock);
  await expect(celebration).toHaveCount(0, { timeout: 7_000 });

  expect(snapshotCalls).toBeGreaterThanOrEqual(5);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("Live TV remains usable when browser storage is blocked", async ({ page }) => {
  await installFakeAudio(page);
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "getItem", {
      configurable: true,
      value() {
        throw new Error("storage blocked");
      },
    });
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value() {
        throw new Error("storage blocked");
      },
    });
  });

  let snapshotCalls = 0;
  await page.route("**/api/live-leaderboard/snapshot", async (route) => {
    snapshotCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeSnapshot(0)),
    });
  });

  await page.goto(`${BASE_URL}/live/leaderboard#${TOKEN}`, { waitUntil: "networkidle" });
  await expect.poll(() => snapshotCalls, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.getByText("Team Today", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Unlock Live Leaderboard sound" }).click();
  await expect(page.getByText("Sound on", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Turn Live Leaderboard sound off" }).click();
  await expect(page.getByText("Sound off", { exact: true })).toBeVisible();
});

test("Leaderboard Preview opens the exact Live TV surface", async ({ page, context }) => {
  test.setTimeout(75_000);
  await installFakeAudio(page);

  const previewUrl = `${BASE_URL}/live/leaderboard#${TOKEN}`;
  let mintedScope = "team";

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
    mintedScope = body.scope === "organization" ? "organization" : "team";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        capability: {
          id: "cap-preview",
          creator_person_id: "person-preview",
          scope: mintedScope,
          created_at: "2026-09-10T15:00:00.000Z",
          revoked_at: null,
          rotated_from_id: null,
        },
        url: previewUrl,
      }),
    });
  });

  await context.route("**/api/live-leaderboard/snapshot", async (route) => {
    const snapshot = makeSnapshot(0);
    snapshot.scope = mintedScope;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot),
    });
  });

  await page.goto(`${BASE_URL}/auth/dev/as?role=producer`, { waitUntil: "commit", timeout: 30_000 });
  await page.goto(`${BASE_URL}/producer/leaderboard`, { waitUntil: "networkidle", timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Leaderboard", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Live", exact: true }).click();
  const createButton = page.getByRole("button", { name: /Create (Team|Organization) link/ });
  await expect(createButton).toBeVisible();
  await createButton.click();

  const previewLink = page.getByRole("link", { name: "Preview", exact: true });
  await expect(previewLink).toHaveAttribute("href", previewUrl);
  const popupPromise = page.waitForEvent("popup");
  await previewLink.click();
  const preview = await popupPromise;
  await preview.waitForLoadState("networkidle");

  expect(preview.url()).toBe(previewUrl);
  await expect(preview.getByRole("button", { name: "Unlock Live Leaderboard sound" })).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByText(mintedScope === "team" ? "Team Today" : "All Star Today", { exact: true })).toBeVisible();
});
