import { Buffer } from "buffer";
import { readFile, unlink } from "fs/promises";
import serverlessChromium from "@sparticuz/chromium";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chromium as playwrightChromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from "playwright-core";
import {
  GATEWAY_ISSUED_PREMIUM_PERIODS,
  recordGatewayIssuedPremiumFailure,
  runGatewayIssuedPremiumImport,
  type GatewayIssuedPremiumImportResult,
  type GatewayIssuedPremiumPeriod,
} from "./issued-premium";

const PERIOD_EXPORT_IDS: Record<GatewayIssuedPremiumPeriod, string> = {
  wtd: "1",
  mtd: "3",
  ytd: "5",
};

const PERIOD_PAGE_PATHS: Record<GatewayIssuedPremiumPeriod, string> = {
  wtd: "ipreport",
  mtd: "ipreport_mtd",
  ytd: "ipreport_ytd",
};

type GatewayReportContext = {
  reportUuid: string;
  reportDate: string;
};

type GatewayCsvDownload = {
  periodType: GatewayIssuedPremiumPeriod;
  reportDate: string;
  sourceFileName: string;
  csvText: string;
};

type GatewayPlaywrightSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function gatewayEmail(): string | null {
  return env("GATEWAY_LOGIN_EMAIL") ?? env("GATEWAY_EMAIL");
}

function gatewayPassword(): string | null {
  return env("GATEWAY_LOGIN_PASSWORD") ?? env("GATEWAY_PASSWORD");
}

function gatewayDashboardUrl(): string {
  return env("GATEWAY_DASHBOARD_URL") ?? "https://ww3.familyfirstlife.com/dashboard";
}

function gatewayLoginUrl(): string {
  return env("GATEWAY_LOGIN_URL") ?? "https://ww3.familyfirstlife.com/login";
}

function gatewayStatsBaseUrl(): string {
  return (env("GATEWAY_STATS_BASE_URL") ?? "https://stats.uppatop.com").replace(/\/+$/, "");
}

function configuredReportUrl(): string | null {
  return env("GATEWAY_IP_REPORT_URL");
}

function configuredReportUuid(): string | null {
  return env("GATEWAY_IP_REPORT_UUID") ?? env("GATEWAY_STATS_REPORT_UUID");
}

function timeoutMs(): number {
  const value = Number(env("GATEWAY_PLAYWRIGHT_TIMEOUT_MS") ?? "120000");
  return Number.isFinite(value) && value > 0 ? value : 120000;
}

function parseHeadless(): boolean {
  return env("GATEWAY_PLAYWRIGHT_HEADLESS") !== "0";
}

function configuredStorageState(): BrowserContextOptions["storageState"] | undefined {
  const path = env("GATEWAY_PLAYWRIGHT_STORAGE_STATE_PATH");
  if (path) return path;

  const json = env("GATEWAY_PLAYWRIGHT_STORAGE_STATE_JSON");
  if (!json) return undefined;

  try {
    return JSON.parse(json) as NonNullable<BrowserContextOptions["storageState"]>;
  } catch {
    throw new Error("GATEWAY_PLAYWRIGHT_STORAGE_STATE_JSON is not valid JSON.");
  }
}

function isoDatesFromText(value: string): string[] {
  return Array.from(value.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)).map((match) => match[0]);
}

function maxIsoDate(values: string[]): string | null {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function extractReportUuid(value: string): string | null {
  const match = /\/ipreport(?:_mtd|_ytd)?\/([0-9a-fA-F-]{36})(?:\/|$)/.exec(value);
  return match?.[1] ?? null;
}

function gatewayExportUuid(reportUuid: string): string {
  return Buffer.from(JSON.stringify({ uuid: reportUuid })).toString("base64");
}

function gatewayExportUrl(
  periodType: GatewayIssuedPremiumPeriod,
  report: GatewayReportContext,
): string {
  const params = new URLSearchParams({
    selected_period: PERIOD_EXPORT_IDS[periodType],
    selected_date: report.reportDate,
    selected_producer: "",
    selected_agency: "",
    uuid: gatewayExportUuid(report.reportUuid),
  });
  return `${gatewayStatsBaseUrl()}/report/issue-paid/download/issue-paid-export?${params}`;
}

function reportPageUrl(
  periodType: GatewayIssuedPremiumPeriod,
  report: GatewayReportContext,
): string {
  return `${gatewayStatsBaseUrl()}/${PERIOD_PAGE_PATHS[periodType]}/${report.reportUuid}/${report.reportDate}`;
}

function defaultSourceFileName(
  periodType: GatewayIssuedPremiumPeriod,
  reportDate: string,
): string {
  return `${reportDate}_${periodType.toUpperCase()}_Downlines_True.csv`;
}

function sourceFileNameFromContentDisposition(value: string | undefined): string | null {
  if (!value) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (star?.[1]) return decodeURIComponent(star[1].replace(/^"|"$/g, ""));

  const plain = /filename="?([^";]+)"?/i.exec(value);
  return plain?.[1] ? decodeURIComponent(plain[1]) : null;
}

function looksLikeGatewayCsv(value: string): boolean {
  const start = value.replace(/^\uFEFF/, "").trimStart().slice(0, 2000);
  return (
    start.startsWith("File Date,Producer,Producer NPN") &&
    start.includes("All Lines Personal") &&
    start.includes("All Lines Team")
  );
}

function dryRunFailureResult(
  periodType: GatewayIssuedPremiumPeriod,
  error: unknown,
): GatewayIssuedPremiumImportResult {
  return {
    periodType,
    status: "failed",
    dryRun: true,
    importId: null,
    reportDate: null,
    periodStart: null,
    gatewayLabel: null,
    sourceFileName: null,
    sourceChecksum: null,
    rowsSeen: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    ambiguousCount: 0,
    skippedCount: 0,
    verifiedSubmittedCount: 0,
    message: error instanceof Error ? error.message : String(error),
    samples: { unmatched: [], ambiguous: [], matched: [] },
  };
}

async function firstVisible(page: Page, selectors: string[]): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
      return locator;
    }
  }
  return null;
}

async function isLoginPage(page: Page): Promise<boolean> {
  const emailInput = await firstVisible(page, [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input#email',
  ]);
  const passwordInput = await firstVisible(page, [
    'input[type="password"]',
    'input[name="password"]',
    'input#password',
  ]);
  return Boolean(emailInput && passwordInput);
}

async function assertNoTwoFactorPrompt(page: Page): Promise<void> {
  const otpInput = await firstVisible(page, [
    'input[autocomplete="one-time-code"]',
    'input[name*="otp" i]',
    'input[name*="code" i]',
    'input[id*="otp" i]',
    'input[id*="code" i]',
  ]);
  const otpText = await page
    .getByText(/two[-\s]?factor|verification code|one[-\s]?time|6[-\s]?digit|otp/i)
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);

  if (otpInput || otpText) {
    throw new Error(
      "Gateway login requires 2FA. Use a long-lived Gateway session/storage state or an official Gateway export/API account for unattended cron.",
    );
  }
}

async function ensureGatewayLogin(page: Page): Promise<void> {
  const email = gatewayEmail();
  const password = gatewayPassword();
  if (!email || !password) return;

  await page.goto(gatewayLoginUrl(), {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs(),
  });

  if (!(await isLoginPage(page))) return;

  const emailInput = await firstVisible(page, [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input#email',
  ]);
  const passwordInput = await firstVisible(page, [
    'input[type="password"]',
    'input[name="password"]',
    'input#password',
  ]);
  if (!emailInput || !passwordInput) {
    throw new Error("Could not find Gateway email/password fields.");
  }

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const loginButton =
    (await firstVisible(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Log In")',
      'button:has-text("Sign In")',
    ])) ?? page.getByRole("button", { name: /log\s*in|sign\s*in/i }).first();
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: timeoutMs() }).catch(() => undefined),
    loginButton.click({ timeout: timeoutMs() }),
  ]);

  await assertNoTwoFactorPrompt(page);
}

async function openIpReportLanding(page: Page): Promise<void> {
  const reportUrl = configuredReportUrl();
  if (reportUrl) {
    await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs() });
    return;
  }

  const reportUuid = configuredReportUuid();
  if (reportUuid) {
    await page.goto(`${gatewayStatsBaseUrl()}/ipreport/${reportUuid}`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs(),
    });
    return;
  }

  await page.goto(gatewayDashboardUrl(), {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs(),
  });

  if (await isLoginPage(page)) {
    throw new Error(
      "Gateway is not authenticated. Set GATEWAY_LOGIN_EMAIL/GATEWAY_LOGIN_PASSWORD, GATEWAY_PLAYWRIGHT_STORAGE_STATE_JSON, or GATEWAY_IP_REPORT_URL.",
    );
  }

  const ipReportLink = page.getByRole("link", { name: /ip report/i }).first();
  if (await ipReportLink.isVisible({ timeout: 10000 }).catch(() => false)) {
    await Promise.all([
      page.waitForURL(/stats\.uppatop\.com\/ipreport/i, { timeout: timeoutMs() }),
      ipReportLink.click(),
    ]);
    return;
  }

  throw new Error("Could not find the Gateway IP Report link on the dashboard.");
}

async function readLatestReportContext(page: Page): Promise<GatewayReportContext> {
  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs() }).catch(() => undefined);
  await assertNoTwoFactorPrompt(page);

  if (await isLoginPage(page)) {
    throw new Error("Gateway report page redirected to login.");
  }

  const data = await page.evaluate(() => {
    const downlineButton = document.querySelector(".downline-ip-report");
    const hrefs = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map(
      (anchor) => anchor.href,
    );

    return {
      url: location.href,
      buttonUuid: downlineButton?.getAttribute("data-uuid") ?? null,
      buttonWeek: downlineButton?.getAttribute("data-week") ?? null,
      hrefs,
      bodyText: document.body.innerText.slice(0, 2000),
    };
  });

  if (/cloudflare|access denied|error occurred/i.test(data.bodyText)) {
    throw new Error("Gateway report page did not load cleanly.");
  }

  const reportUuid =
    data.buttonUuid ??
    extractReportUuid(data.url) ??
    data.hrefs.map(extractReportUuid).find(Boolean) ??
    null;
  if (!reportUuid) {
    throw new Error("Could not determine Gateway report UUID.");
  }

  const dates = [
    ...(data.buttonWeek ? [data.buttonWeek] : []),
    ...isoDatesFromText(data.url),
    ...data.hrefs.flatMap(isoDatesFromText),
  ];
  const reportDate = maxIsoDate(dates);
  if (!reportDate) {
    throw new Error("Could not determine latest Gateway report date.");
  }

  return { reportUuid, reportDate };
}

async function createGatewayPlaywrightSession(): Promise<GatewayPlaywrightSession> {
  const browser = await playwrightChromium.launch({
    headless: parseHeadless() ? serverlessChromium.headless : false,
    executablePath:
      env("GATEWAY_CHROMIUM_EXECUTABLE_PATH") ??
      (await serverlessChromium.executablePath()),
    args: [
      ...serverlessChromium.args,
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    storageState: configuredStorageState(),
  });
  const page = await context.newPage();
  return { browser, context, page };
}

async function downloadCsvFromBrowser(
  session: GatewayPlaywrightSession,
  periodType: GatewayIssuedPremiumPeriod,
  report: GatewayReportContext,
): Promise<GatewayCsvDownload> {
  const exportUrl = gatewayExportUrl(periodType, report);
  const direct = await session.context.request.get(exportUrl, {
    failOnStatusCode: false,
    headers: {
      Accept: "text/csv,application/vnd.ms-excel,text/plain,*/*",
      Referer: reportPageUrl(periodType, report),
    },
    timeout: timeoutMs(),
  });

  const directText = await direct.text();
  if (direct.ok() && looksLikeGatewayCsv(directText)) {
    return {
      periodType,
      reportDate: report.reportDate,
      sourceFileName:
        sourceFileNameFromContentDisposition(direct.headers()["content-disposition"]) ??
        defaultSourceFileName(periodType, report.reportDate),
      csvText: directText,
    };
  }

  await session.page.goto(reportPageUrl(periodType, report), {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs(),
  });

  const downloadPromise = session.page.waitForEvent("download", { timeout: timeoutMs() });
  await session.page.evaluate((href: string) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.target = "_self";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }, exportUrl);

  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error(`Gateway ${periodType.toUpperCase()} download did not provide a local file path.`);
  }

  try {
    const csvText = await readFile(downloadPath, "utf8");
    if (!looksLikeGatewayCsv(csvText)) {
      throw new Error(`Gateway ${periodType.toUpperCase()} download was not the expected CSV.`);
    }

    return {
      periodType,
      reportDate: report.reportDate,
      sourceFileName: download.suggestedFilename() || defaultSourceFileName(periodType, report.reportDate),
      csvText,
    };
  } finally {
    await unlink(downloadPath).catch(() => undefined);
  }
}

export async function downloadGatewayIssuedPremiumCsvsWithPlaywright(
  periods: GatewayIssuedPremiumPeriod[] = [...GATEWAY_ISSUED_PREMIUM_PERIODS],
): Promise<GatewayCsvDownload[]> {
  const session = await createGatewayPlaywrightSession();
  try {
    await ensureGatewayLogin(session.page);
    await openIpReportLanding(session.page);
    const report = await readLatestReportContext(session.page);

    const downloads: GatewayCsvDownload[] = [];
    for (const periodType of periods) {
      downloads.push(await downloadCsvFromBrowser(session, periodType, report));
    }
    return downloads;
  } finally {
    await session.browser.close().catch(() => undefined);
  }
}

export async function runGatewayIssuedPremiumPlaywrightImports(
  supabase: SupabaseClient,
  opts: {
    periods?: GatewayIssuedPremiumPeriod[];
    dryRun?: boolean;
    force?: boolean;
  } = {},
): Promise<GatewayIssuedPremiumImportResult[]> {
  const periods = opts.periods?.length ? opts.periods : [...GATEWAY_ISSUED_PREMIUM_PERIODS];
  const dryRun = opts.dryRun === true;

  let downloads: GatewayCsvDownload[];
  try {
    downloads = await downloadGatewayIssuedPremiumCsvsWithPlaywright(periods);
  } catch (err) {
    if (dryRun) return periods.map((periodType) => dryRunFailureResult(periodType, err));
    return Promise.all(
      periods.map((periodType) => recordGatewayIssuedPremiumFailure(supabase, periodType, err)),
    );
  }

  const downloadByPeriod = new Map(downloads.map((download) => [download.periodType, download]));
  const results: GatewayIssuedPremiumImportResult[] = [];

  for (const periodType of periods) {
    try {
      const download = downloadByPeriod.get(periodType);
      if (!download) {
        throw new Error(`Gateway ${periodType.toUpperCase()} CSV was not downloaded.`);
      }

      results.push(
        await runGatewayIssuedPremiumImport(supabase, {
          periodType,
          dryRun,
          force: opts.force,
          csvText: download.csvText,
          sourceFileName: download.sourceFileName,
          reportDate: download.reportDate,
        }),
      );
    } catch (err) {
      results.push(
        dryRun
          ? dryRunFailureResult(periodType, err)
          : await recordGatewayIssuedPremiumFailure(supabase, periodType, err),
      );
    }
  }

  return results;
}
