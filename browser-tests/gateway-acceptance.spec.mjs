import { expect, test } from "@playwright/test";

const BASE_URL = process.env.BROWSER_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3101";
const BASE_ORIGIN = new URL(BASE_URL).origin;
const ROUTE_ANNOUNCER_ID = "__next-route-announcer__";

function isApplicationUrl(rawUrl) {
  try {
    return new URL(rawUrl).origin === BASE_ORIGIN;
  } catch {
    return false;
  }
}

function monitorApplicationFailures(page) {
  const pageErrors = [];
  const requestFailures = [];
  const httpErrors = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (isApplicationUrl(request.url())) {
      requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "failed"}`);
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== BASE_ORIGIN || url.pathname === "/favicon.ico") return;
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.request().method()} ${url.pathname}`);
  });

  return { pageErrors, requestFailures, httpErrors };
}

async function signInAs(page, role) {
  // The first dev-auth request can include a cold Next/Turbopack compile. Keep the readiness
  // boundary explicit (commit + URL/body assertions below) without making a 10s cold compile
  // look like an application failure.
  await page.goto(`${BASE_URL}/auth/dev/as?role=${role}`, { waitUntil: "commit", timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`/${role === "admin" ? "admin" : "producer"}(?:\\?|$)`));
  await expect(page.locator("body")).toBeVisible();
}

async function gotoApp(page, path, expectedPathname = path.split("?")[0]) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "commit", timeout: 30_000 });
  await expect.poll(() => new URL(page.url()).pathname).toBe(expectedPathname);
  await expect(page.locator("body")).toBeVisible();
}

async function applicationAlertMessages(page) {
  return page.locator('[role="alert"]').evaluateAll(
    (alerts, routeAnnouncerId) =>
      alerts
        .filter((alert) => alert.id !== routeAnnouncerId)
        .map((alert) => alert.textContent?.trim() || "<empty application alert>"),
    ROUTE_ANNOUNCER_ID,
  );
}

async function expectNoUnexpectedUiError(page) {
  await expect
    .poll(() => applicationAlertMessages(page), {
      message: "Expected no application alerts (Next route announcer is ignored)",
    })
    .toEqual([]);
  const body = page.locator("body");
  await expect(body).not.toContainText("Issued Premium is temporarily unavailable");
  await expect(body).not.toContainText("The report data could not be loaded");
  await expect(body).not.toContainText("Scorecards is temporarily unavailable");
  await expect(body).not.toContainText("Unable to load Gateway report coverage");
  await expect(body).not.toContainText("Application error");
  await expect(body).not.toContainText("Internal Server Error");
}

function expectTransportClean(telemetry) {
  expect(telemetry.pageErrors).toEqual([]);
  expect(telemetry.requestFailures).toEqual([]);
  expect(telemetry.httpErrors).toEqual([]);
}

test("alert filtering ignores only the Next route announcer", async ({ page }) => {
  await page.setContent(`
    <div id="__next-route-announcer__" role="alert">All Star OS</div>
    <p role="alert">real application error</p>
  `);

  await expect.poll(() => applicationAlertMessages(page)).toEqual(["real application error"]);
});

test("Producer Gateway settings and Scorecards render independently of Gateway-report schema readiness", async ({ page }) => {
  const telemetry = monitorApplicationFailures(page);
  await signInAs(page, "producer");

  await gotoApp(page, "/producer?settings=gateway");
  const gatewaySettings = page.getByTestId("gateway-connection-settings");
  await expect(gatewaySettings).toHaveCount(1);
  await expect(gatewaySettings).toBeVisible();
  const gatewayLifecycleControl = gatewaySettings.getByRole("button", {
    name: /^(Connect Gateway|Reconnect Gateway|Disconnect Gateway)$/,
  });
  await expect(gatewayLifecycleControl).toHaveCount(1);
  await expect(gatewayLifecycleControl).toBeVisible();
  await expect(gatewaySettings.getByText(/We do not store your Gateway password or verification codes/i)).toBeVisible();
  // This is a render/readiness acceptance check. Do not click the lifecycle control here:
  // connect/reconnect/disconnect has its own server/session lifecycle and external Gateway boundary.
  await expectNoUnexpectedUiError(page);

  await gotoApp(page, "/producer/scorecards");
  await expect(page.getByRole("heading", { name: "Scorecards", exact: true })).toBeVisible();
  await expectNoUnexpectedUiError(page);

  expectTransportClean(telemetry);
});

test("Producer Issued Premium must load a valid intentional state rather than a schema error", async ({ page }) => {
  const telemetry = monitorApplicationFailures(page);
  await signInAs(page, "producer");

  await gotoApp(page, "/producer/issued-premium");
  const body = page.locator("body");
  await expect(body).toContainText("Issued Premium");
  await expectNoUnexpectedUiError(page);
  // Multiple valid UI facts may coexist (for example, loaded history plus a reconnect notice),
  // so assert the presence of an intentional state without imposing an artificial global count.
  await expect(body).toContainText(/Connect Gateway to see Issued Premium|Your Gateway reports are being prepared|Your Gateway report needs attention|No issued premium yet|Gateways Uploaded/);

  expectTransportClean(telemetry);
});

test("Admin Gateway coverage must load real results rather than passing on an error page", async ({ page }) => {
  const telemetry = monitorApplicationFailures(page);
  await signInAs(page, "admin");

  await gotoApp(page, "/admin/scorecards/coverage");
  await expect(page.getByRole("heading", { name: "Gateway Coverage", exact: true })).toBeVisible();
  await expectNoUnexpectedUiError(page);
  await expect(page.locator("#coverage-results-title")).toBeVisible();
  await expect(page.getByText("In Scope", { exact: true })).toBeVisible();
  await expect(page.getByText("Covered", { exact: true })).toBeVisible();
  await expect(page.getByText("Missing", { exact: true })).toBeVisible();

  expectTransportClean(telemetry);
});
