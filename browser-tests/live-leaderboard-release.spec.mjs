import { expect, test } from "@playwright/test";

const TOKEN = "ll_" + "r".repeat(43);

function snapshot(hasDeal) {
  const submitted = hasDeal ? 75000 : 0;
  const deals = hasDeal ? 1 : 0;
  return {
    ok: true,
    scope: "team",
    asOf: new Date().toISOString(),
    shop_day: "2026-09-10",
    range: { from: "2026-09-10", to: "2026-09-10" },
    totals: {
      submitted_ap_cents: submitted,
      deals,
      people: deals,
      average_ticket_cents: submitted,
    },
    periods: {
      week: {
        range: { from: "2026-09-07", to: "2026-09-10" },
        submitted_ap_cents: submitted,
        deals,
      },
      month: {
        range: { from: "2026-09-01", to: "2026-09-10" },
        submitted_ap_cents: submitted,
        deals,
      },
    },
    rows: hasDeal
      ? [{ full_name: "Sarah Agent", photo_url: null, submitted_ap_cents: 75000, sales_count: 1 }]
      : [],
    events: hasDeal
      ? [{
          id: "lde_" + "9".repeat(43),
          display_name: "Sarah Agent",
          submitted_ap_cents: 75000,
          carrier: null,
          occurred_at: "2026-09-10T15:00:00.000Z",
        }]
      : [],
  };
}

test("same capability stays fresh on independent displays and revocation invalidates both", async ({ context }) => {
  test.setTimeout(45_000);
  let hasDeal = false;
  let revoked = false;

  await context.route("**/api/live-leaderboard/snapshot", async (route) => {
    if (revoked) {
      await route.fulfill({
        status: 410,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "Ask for a new link." }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot(hasDeal)),
    });
  });

  const first = await context.newPage();
  const second = await context.newPage();
  const url = `/live/leaderboard#${TOKEN}`;

  await Promise.all([
    first.goto(url, { waitUntil: "networkidle" }),
    second.goto(url, { waitUntil: "networkidle" }),
  ]);
  await Promise.all([
    expect(first.getByText("No deals yet today.", { exact: true })).toBeVisible({ timeout: 30_000 }),
    expect(second.getByText("No deals yet today.", { exact: true })).toBeVisible({ timeout: 30_000 }),
  ]);

  const freshnessStartedAt = Date.now();
  hasDeal = true;
  await Promise.all([
    expect(first.getByText("Sarah Agent", { exact: true }).first()).toBeVisible({ timeout: 5_000 }),
    expect(second.getByText("Sarah Agent", { exact: true }).first()).toBeVisible({ timeout: 5_000 }),
  ]);
  const freshnessMs = Date.now() - freshnessStartedAt;
  console.log(`LIVE_FRESHNESS_MS=${freshnessMs}`);
  expect(freshnessMs).toBeLessThan(5_000);

  revoked = true;
  await Promise.all([
    expect(first.getByRole("heading", { name: "Ask for a new link." })).toBeVisible({ timeout: 6_000 }),
    expect(second.getByRole("heading", { name: "Ask for a new link." })).toBeVisible({ timeout: 6_000 }),
  ]);
});

test("adjacent producer surfaces still load after the Live workstream", async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto("/auth/dev/as?role=producer", { waitUntil: "commit", timeout: 30_000 });

  const routes = [
    ["/producer/leaderboard", "Leaderboard"],
    ["/producer/tracker", "Daily Tracker"],
    ["/producer/scorecards", "Scorecards"],
    ["/producer/issued-premium", "Issued Premium"],
  ];

  for (const [route, heading] of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Application error/i)).toHaveCount(0);
  }
});
