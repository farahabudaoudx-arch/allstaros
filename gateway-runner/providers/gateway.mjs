import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { GatewaySessionExpiredError, GatewayTransientError } from "../engine.mjs";

const DEFAULT_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_DASHBOARD_URL = "https://ww3.familyfirstlife.com/dashboard";
const DEFAULT_STATS_BASE_URL = "https://stats.uppatop.com";
const REQUIRED_COLUMNS = [
  "File Date",
  "Producer",
  "Producer NPN",
  "Email",
  "Upline",
  "Upline NPN",
  "Agency",
  "All Lines Personal",
  "All Lines Team",
  "1st Leg Producer",
  "1st Leg NPN",
  "1st Leg %",
  "Outside 1st Leg",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function integerEnv(env, name, fallback, min, max) {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function providerConfig(env = process.env) {
  const dashboardUrl = new URL(env.GATEWAY_RUNNER_GATEWAY_DASHBOARD_URL?.trim() || DEFAULT_DASHBOARD_URL);
  const statsBaseUrl = new URL(env.GATEWAY_RUNNER_GATEWAY_STATS_BASE_URL?.trim() || DEFAULT_STATS_BASE_URL);
  return {
    chromePath: env.GATEWAY_RUNNER_GATEWAY_CHROME_PATH?.trim() || DEFAULT_CHROME_PATH,
    legacyProfileDir: env.GATEWAY_RUNNER_GATEWAY_LEGACY_PROFILE_DIR?.trim() || null,
    legacyCdpPort: integerEnv(env, "GATEWAY_RUNNER_GATEWAY_LEGACY_CDP_PORT", 9223, 1024, 65535),
    dashboardUrl,
    statsBaseUrl,
    backgroundHeadless: env.GATEWAY_RUNNER_GATEWAY_HEADLESS !== "false",
    launchTimeoutMs: integerEnv(env, "GATEWAY_RUNNER_GATEWAY_LAUNCH_TIMEOUT_MS", 30_000, 5_000, 120_000),
    stepTimeoutMs: integerEnv(env, "GATEWAY_RUNNER_GATEWAY_STEP_TIMEOUT_MS", 60_000, 5_000, 300_000),
    downloadTimeoutMs: integerEnv(env, "GATEWAY_RUNNER_GATEWAY_DOWNLOAD_TIMEOUT_MS", 180_000, 30_000, 600_000),
  };
}

async function cdpReady(endpoint) {
  try {
    const response = await fetch(`${endpoint}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForChromeCdp(endpoint, timeoutMs, signal) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    throwIfAborted(signal);
    if (await cdpReady(endpoint)) return;
    await delay(250, signal);
  }
  throw new GatewayTransientError("Gateway legacy Chrome profile did not expose its debugging endpoint.");
}

async function waitForChromeCdpClosed(endpoint, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!(await cdpReady(endpoint))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new GatewayTransientError("Gateway legacy Chrome profile did not release its debugging endpoint.");
}

async function withLegacyProfileBrowser(config, signal, action) {
  const endpoint = `http://127.0.0.1:${config.legacyCdpPort}`;
  if (await cdpReady(endpoint)) {
    throw new GatewayTransientError("Gateway legacy Chrome profile is already in use; retry after the active run finishes.");
  }

  throwIfAborted(signal);
  const child = spawn(config.chromePath, [
    `--remote-debugging-port=${config.legacyCdpPort}`,
    `--user-data-dir=${config.legacyProfileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-popup-blocking",
    "--password-store=basic",
    "--use-mock-keychain",
    config.dashboardUrl.toString(),
  ], { stdio: "ignore" });

  let browser;
  let page;
  try {
    await waitForChromeCdp(endpoint, config.launchTimeoutMs, signal);
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    if (!context) throw new GatewayTransientError("Gateway legacy Chrome profile did not expose a browser context.");
    page = await context.newPage();
    page.setDefaultTimeout(config.stepTimeoutMs);
    page.setDefaultNavigationTimeout(config.stepTimeoutMs);
    return await action({ browser, context, page });
  } catch (error) {
    throw mapProviderError(error, signal);
  } finally {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    if (!child.killed) child.kill("SIGTERM");
    await waitForChromeCdpClosed(endpoint, config.launchTimeoutMs);
  }
}

function gatewayLoginCredentials(env = process.env, enabled = false) {
  if (!enabled) return null;
  const email = env.GATEWAY_LOGIN_EMAIL?.trim();
  const password = env.GATEWAY_LOGIN_PASSWORD;
  return email && password ? { email, password } : null;
}

function abortReason(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortReason(signal));
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer.unref?.();
  });
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const instant = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

function monthEnd(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function parseMonthId(monthId) {
  const match = /^([A-Za-z]+)-(\d{4})$/.exec(monthId ?? "");
  if (!match) throw new GatewayTransientError("Gateway weekly navigation is missing its covered month identity.");
  const monthIndex = MONTHS.findIndex((name) => name.toLowerCase() === match[1].toLowerCase());
  if (monthIndex < 0) throw new GatewayTransientError("Gateway weekly navigation returned an unknown month.");
  const year = Number(match[2]);
  const month = monthIndex + 1;
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  return {
    monthName: MONTHS[monthIndex],
    year,
    month,
    periodStart,
    periodEnd: monthEnd(year, month),
  };
}

function normalizeWeeklyEntries(rawEntries) {
  const seen = new Set();
  const entries = [];
  for (const raw of rawEntries ?? []) {
    const date = String(raw?.date ?? "").trim();
    const weekOrdinal = Number(raw?.weekOrdinal);
    if (!validIsoDate(date) || !Number.isInteger(weekOrdinal) || weekOrdinal < 1 || weekOrdinal > 8) continue;
    const month = parseMonthId(String(raw?.monthId ?? ""));
    if (date < month.periodStart || date > month.periodEnd) {
      throw new GatewayTransientError("Gateway weekly navigation date falls outside its covered month.");
    }
    const key = `${date}|${weekOrdinal}|${month.periodStart}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      date,
      weekOrdinal,
      monthId: raw.monthId,
      monthName: month.monthName,
      periodStart: month.periodStart,
      periodEnd: month.periodEnd,
      gatewayLabel: `${month.monthName} Week ${weekOrdinal}`,
    });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const maxOrdinalByMonth = new Map();
  for (const entry of entries) {
    maxOrdinalByMonth.set(
      entry.periodStart,
      Math.max(maxOrdinalByMonth.get(entry.periodStart) ?? 0, entry.weekOrdinal),
    );
  }
  return entries.map((entry) => ({
    ...entry,
    periodFinal: entry.weekOrdinal === maxOrdinalByMonth.get(entry.periodStart),
  }));
}

function historicalPlan(entries, from, through) {
  const eligible = entries.filter((entry) => entry.date >= from && entry.date <= through);
  if (eligible.length === 0) return [];
  const latest = eligible.at(-1);
  const plan = [];
  for (const entry of eligible) {
    plan.push({ periodType: "wtd", entry });
    if (entry.periodFinal) {
      plan.push({ periodType: "mtd", entry });
      plan.push({ periodType: "ytd", entry });
    }
  }
  if (!latest.periodFinal) {
    plan.push({ periodType: "mtd", entry: latest });
    plan.push({ periodType: "ytd", entry: latest });
  }
  return plan;
}

function xmlDecode(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function xmlText(bytes) {
  return bytes ? new TextDecoder("utf-8").decode(bytes) : "";
}

function attr(source, name) {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(source)?.[1] ?? null;
}

function workbookSheetPath(files) {
  const workbook = xmlText(files["xl/workbook.xml"]);
  const sheetAttrs = /<sheet\b([^>]*)\/?\s*>/i.exec(workbook)?.[1] ?? "";
  const relId = attr(sheetAttrs, "r:id");
  if (!relId) return "xl/worksheets/sheet1.xml";
  const rels = xmlText(files["xl/_rels/workbook.xml.rels"]);
  for (const match of rels.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    if (attr(match[1], "Id") !== relId) continue;
    const target = attr(match[1], "Target");
    if (!target) break;
    const normalized = target.replace(/^\//, "").replace(/^xl\//, "");
    return `xl/${normalized}`;
  }
  return "xl/worksheets/sheet1.xml";
}

function sharedStrings(files) {
  const source = xmlText(files["xl/sharedStrings.xml"]);
  if (!source) return [];
  return [...source.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
      .map((text) => xmlDecode(text[1]))
      .join(""),
  );
}

function columnIndex(reference) {
  const letters = /^([A-Z]+)/i.exec(reference ?? "")?.[1]?.toUpperCase();
  if (!letters) return null;
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}

function parseWorksheet(files) {
  const source = xmlText(files[workbookSheetPath(files)]);
  if (!source) throw new Error("Gateway workbook is missing its first worksheet.");
  const strings = sharedStrings(files);
  const rows = [];
  for (const rowMatch of source.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const index = columnIndex(attr(attributes, "r"));
      if (index == null) continue;
      const type = attr(attributes, "t") ?? "n";
      const valueText = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)?.[1] ?? "";
      let value;
      if (type === "s") value = strings[Number(valueText)] ?? "";
      else if (type === "inlineStr") {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((m) => xmlDecode(m[1])).join("");
      } else if (type === "str") value = xmlDecode(valueText);
      else if (type === "b") value = valueText === "1";
      else if (valueText !== "" && Number.isFinite(Number(valueText))) value = Number(valueText);
      else value = xmlDecode(valueText);
      row[index] = value;
    }
    rows.push(row);
  }
  return rows;
}

function excelSerialToIso(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return null;
  const millis = Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000);
  return new Date(millis).toISOString().slice(0, 10);
}

function normalizeGatewayDate(value) {
  if (typeof value === "number") return excelSerialToIso(value);
  const text = String(value ?? "").trim();
  if (validIsoDate(text)) return text;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const iso = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  return validIsoDate(iso) ? iso : null;
}

function usDate(iso) {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatIdentifier(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return String(value).trim().replace(/\.0$/, "");
}

function formatMoney(value) {
  if (value == null || value === "") return "$0.00";
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(numeric)) return String(value).trim() || "$0.00";
  return `$${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return `${(value > 1 ? value : value * 100).toFixed(2)}%`;
  return String(value).trim();
}

function workbookToGatewayCsv(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const rows = parseWorksheet(files);
  if (rows.length < 2) throw new Error("Gateway workbook is empty or missing data rows.");
  const headers = rows[0].map((value) => String(value ?? "").replace(/^\uFEFF/, "").trim());
  const columns = new Map(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_COLUMNS.filter((header) => !columns.has(header));
  if (missing.length) throw new Error(`Gateway workbook is missing required columns: ${missing.join(", ")}`);
  const get = (row, name) => row[columns.get(name)] ?? "";
  const output = [];
  let fileDate = null;
  for (const row of rows.slice(1)) {
    if (!cleanText(get(row, "Producer")) || !formatIdentifier(get(row, "Producer NPN"))) continue;
    const rowDate = normalizeGatewayDate(get(row, "File Date"));
    if (!rowDate) throw new Error("Gateway workbook contains an invalid File Date.");
    if (fileDate && fileDate !== rowDate) throw new Error("Gateway workbook contains inconsistent File Date values.");
    fileDate = rowDate;
    output.push([
      usDate(rowDate),
      cleanText(get(row, "Producer")),
      formatIdentifier(get(row, "Producer NPN")),
      String(get(row, "Email") ?? "").trim(),
      cleanText(get(row, "Upline")),
      formatIdentifier(get(row, "Upline NPN")),
      cleanText(get(row, "Agency")),
      formatMoney(get(row, "All Lines Personal")),
      formatMoney(get(row, "All Lines Team")),
      cleanText(get(row, "1st Leg Producer")),
      formatIdentifier(get(row, "1st Leg NPN")),
      formatPercent(get(row, "1st Leg %")),
      formatMoney(get(row, "Outside 1st Leg")),
    ]);
  }
  if (!fileDate || output.length === 0) throw new Error("Gateway workbook contains no usable producer rows.");
  return {
    fileDate,
    rowCount: output.length,
    csvText: [REQUIRED_COLUMNS, ...output].map((row) => row.map(csvEscape).join(",")).join("\n"),
  };
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function mapProviderError(error, signal) {
  if (signal?.aborted) return abortReason(signal);
  if (error instanceof GatewaySessionExpiredError || error instanceof GatewayTransientError) return error;
  if (error?.name === "AbortError") return error;
  return new GatewayTransientError("Gateway browser operation failed.");
}

async function withBrowser(config, { storageState, headless, signal }, action) {
  throwIfAborted(signal);
  let browser;
  const onAbort = () => browser?.close().catch(() => undefined);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    browser = await chromium.launch({
      executablePath: config.chromePath,
      headless,
      timeout: config.launchTimeoutMs,
      args: ["--disable-popup-blocking", "--no-default-browser-check"],
    });
    const context = await browser.newContext({
      acceptDownloads: true,
      ...(storageState ? { storageState } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(config.stepTimeoutMs);
    page.setDefaultNavigationTimeout(config.stepTimeoutMs);
    return await action({ browser, context, page });
  } catch (error) {
    throw mapProviderError(error, signal);
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await browser?.close().catch(() => undefined);
  }
}

async function gatewayLoginState(page) {
  return page.evaluate(() => {
    const login = document.querySelector("#login-email") && document.querySelector("#login-password");
    const otp = document.querySelector("#secretKey1");
    return {
      loginVisible: Boolean(login),
      otpVisible: Boolean(otp && getComputedStyle(otp).display !== "none"),
      url: location.href,
    };
  });
}

async function waitForInteractiveLogin(page, config, signal, credentials) {
  await page.goto(config.dashboardUrl.toString(), { waitUntil: "domcontentloaded" });
  let verificationWasRequired = false;
  let configuredLoginSubmitted = false;
  while (true) {
    throwIfAborted(signal);
    if (page.isClosed()) throw new GatewayTransientError("Gateway sign-in browser was closed before connection completed.");
    const state = await gatewayLoginState(page);
    verificationWasRequired ||= state.otpVisible;
    if (state.loginVisible && credentials && !configuredLoginSubmitted) {
      await page.locator("#login-email").fill(credentials.email);
      await page.locator("#login-password").fill(credentials.password);
      const remember = page.locator("#remember-me");
      if ((await remember.count()) > 0) await remember.setChecked(true).catch(() => undefined);
      configuredLoginSubmitted = true;
      await page.getByRole("button", { name: "Login" }).click();
      await page.waitForLoadState("domcontentloaded", { timeout: config.stepTimeoutMs }).catch(() => undefined);
      await page.waitForURL(/dashboard/i, { timeout: config.stepTimeoutMs }).catch(() => undefined);
      continue;
    }
    if (/\/dashboard(?:[/?#]|$)/i.test(new URL(state.url).pathname) && !state.loginVisible && !state.otpVisible) {
      return verificationWasRequired;
    }
    await delay(500, signal);
  }
}

async function ensureDashboardSession(page, config) {
  await page.goto(config.dashboardUrl.toString(), { waitUntil: "domcontentloaded" });
  const state = await gatewayLoginState(page);
  if (state.loginVisible || state.otpVisible) throw new GatewaySessionExpiredError();
}

async function openGatewayIpReport(page, config) {
  await ensureDashboardSession(page, config);
  const baseUrl = config.statsBaseUrl.origin;
  const autologin = await page.evaluate(async (targetBaseUrl) => {
    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
    const response = await fetch("/api/autologinUser/ipreport", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-CSRF-TOKEN": csrf,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({ base_url: targetBaseUrl }),
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    return { status: response.status, ok: response.ok, parsed };
  }, baseUrl);
  if ([401, 403].includes(autologin.status)) throw new GatewaySessionExpiredError();
  if (autologin.status === 429 || autologin.status >= 500) {
    throw new GatewayTransientError(`Gateway IP Report autologin returned HTTP ${autologin.status}.`);
  }
  if (!autologin.ok || !autologin.parsed?.status || typeof autologin.parsed?.url !== "string") {
    throw new GatewayTransientError("Gateway IP Report autologin did not return a usable report URL.");
  }
  const reportUrl = new URL(autologin.parsed.url);
  if (reportUrl.protocol !== "https:" || reportUrl.origin !== config.statsBaseUrl.origin) {
    throw new GatewayTransientError("Gateway IP Report autologin returned an unexpected destination.");
  }
  await page.goto(reportUrl.toString(), { waitUntil: "domcontentloaded" });
  await page.locator(".downline-ip-report").first().waitFor({ state: "visible" });
  const identity = await page.evaluate(() => {
    const root = document.querySelector(".downline-ip-report");
    return {
      uuid: root?.getAttribute("data-uuid") || "",
      gatewayDate: root?.getAttribute("data-week") || "",
    };
  });
  if (!identity.uuid || !validIsoDate(identity.gatewayDate)) {
    throw new GatewayTransientError("Gateway current report is missing its weekly identity.");
  }
  return identity;
}

async function readWeeklyEntries(page, uuid) {
  const raw = await page.evaluate((targetUuid) => {
    const rows = [];
    for (const anchor of document.querySelectorAll("a[href*='/ipreport/']")) {
      const href = anchor.href || "";
      if (!href.includes(`/ipreport/${targetUuid}/`)) continue;
      const date = href.match(/\/(\d{4}-\d{2}-\d{2})(?:[?#].*)?$/)?.[1] || "";
      const weekOrdinal = Number((anchor.textContent || "").match(/Week\s+(\d+)/i)?.[1] || "");
      let node = anchor.parentElement;
      let monthId = "";
      while (node) {
        if (/^[A-Za-z]+-\d{4}$/.test(node.id || "")) {
          monthId = node.id;
          break;
        }
        node = node.parentElement;
      }
      rows.push({ date, weekOrdinal, monthId });
    }
    return rows;
  }, uuid);
  return normalizeWeeklyEntries(raw);
}

function periodUrl(config, periodType, uuid, gatewayDate, currentWtd = false) {
  if (periodType === "wtd" && currentWtd) {
    return new URL(`/ipreport/${encodeURIComponent(uuid)}`, config.statsBaseUrl).toString();
  }
  const prefix = periodType === "wtd" ? "ipreport" : `ipreport_${periodType}`;
  return new URL(`/${prefix}/${encodeURIComponent(uuid)}/${gatewayDate}`, config.statsBaseUrl).toString();
}

async function downloadGatewayWorkbook(page, config, periodType, uuid, gatewayDate, currentWtd = false) {
  const url = periodUrl(config, periodType, uuid, gatewayDate, currentWtd);
  await page.goto(url, { waitUntil: "load" });
  if (/Page Not Found/i.test(await page.locator("body").innerText().catch(() => ""))) {
    throw new GatewayTransientError(`Gateway ${periodType.toUpperCase()} report is not available yet.`);
  }
  const button = page.locator(`button.downline-ip-report[data-type="${periodType}"]`);
  await button.waitFor({ state: "visible" });
  await button.scrollIntoViewIfNeeded();
  const popupPromise = page.waitForEvent("popup", { timeout: config.stepTimeoutMs });
  await button.dispatchEvent("click");
  const popup = await popupPromise;
  try {
    const downloadPromise = popup.waitForEvent("download", { timeout: config.downloadTimeoutMs });
    await popup.waitForLoadState("domcontentloaded", { timeout: config.stepTimeoutMs }).catch(() => undefined);
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    if (!stream) throw new GatewayTransientError("Gateway report download did not produce a readable workbook.");
    return {
      suggestedName: download.suggestedFilename(),
      buffer: await streamToBuffer(stream),
    };
  } finally {
    await popup.close().catch(() => undefined);
  }
}

function assertWeekEvidence(entry, weekStart) {
  if (!validIsoDate(weekStart) || weekStart > entry.date) {
    throw new GatewayTransientError("Gateway WTD File Date is inconsistent with its weekly navigation identity.");
  }
  const start = Date.parse(`${weekStart}T00:00:00.000Z`);
  const end = Date.parse(`${entry.date}T00:00:00.000Z`);
  if ((end - start) / 86_400_000 > 6) {
    throw new GatewayTransientError("Gateway WTD evidence spans more than one weekly interval.");
  }
}

function assertAggregateEvidence(periodType, entry, fileDate) {
  if (periodType === "mtd" && fileDate !== entry.periodStart) {
    throw new GatewayTransientError("Gateway MTD File Date does not match the covered month.");
  }
  if (periodType === "ytd") {
    const yearStart = `${entry.periodStart.slice(0, 4)}-01-01`;
    if (fileDate !== yearStart) {
      throw new GatewayTransientError("Gateway YTD File Date does not match the covered year.");
    }
  }
}

async function reportForPlanItem(page, config, uuid, acquisitionDate, item, { currentWtd = false } = {}) {
  const downloaded = await downloadGatewayWorkbook(
    page,
    config,
    item.periodType,
    uuid,
    item.entry.date,
    currentWtd && item.periodType === "wtd",
  );
  let parsed;
  try {
    parsed = workbookToGatewayCsv(downloaded.buffer);
  } catch {
    throw new GatewayTransientError("Gateway report workbook could not be converted to the required CSV shape.");
  }
  const sourceFileName = downloaded.suggestedName.replace(/\.(xlsx|xls)$/i, ".csv");
  if (item.periodType === "wtd") {
    assertWeekEvidence(item.entry, parsed.fileDate);
    return {
      periodType: "wtd",
      csvText: parsed.csvText,
      reportDate: acquisitionDate,
      sourceFileName,
      gatewayLabel: item.entry.gatewayLabel,
      coverage: {
        periodStart: item.entry.periodStart,
        periodEnd: item.entry.periodEnd,
        weekStart: parsed.fileDate,
        weekOrdinal: item.entry.weekOrdinal,
        periodFinal: item.entry.periodFinal,
      },
    };
  }
  if (item.periodType === "mtd") {
    assertAggregateEvidence("mtd", item.entry, parsed.fileDate);
    return {
      periodType: "mtd",
      csvText: parsed.csvText,
      reportDate: acquisitionDate,
      sourceFileName,
      gatewayLabel: `${MONTHS[Number(parsed.fileDate.slice(5, 7)) - 1]} MTD`,
      coverage: {
        periodStart: parsed.fileDate,
        periodEnd: monthEnd(Number(parsed.fileDate.slice(0, 4)), Number(parsed.fileDate.slice(5, 7))),
      },
    };
  }
  assertAggregateEvidence("ytd", item.entry, parsed.fileDate);
  return {
    periodType: "ytd",
    csvText: parsed.csvText,
    reportDate: acquisitionDate,
    sourceFileName,
    gatewayLabel: `${parsed.fileDate.slice(0, 4)} YTD`,
    coverage: {
      periodStart: parsed.fileDate,
      periodEnd: `${parsed.fileDate.slice(0, 4)}-12-31`,
    },
  };
}

function validSession(session) {
  return session?.version === 1 && session.storageState && Array.isArray(session.storageState.cookies);
}

const HOSTED_KEYS = new Set([
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

function hostedBrowserController(page) {
  return {
    async captureFrame() {
      if (page.isClosed()) throw new GatewayTransientError("Gateway hosted browser page is closed.");
      return page.screenshot({ type: "jpeg", quality: 72 });
    },
    async handleInput(action) {
      if (!action || typeof action !== "object" || page.isClosed()) throw new Error("Invalid hosted browser input.");
      if (action.type === "click") {
        const x = Number(action.x);
        const y = Number(action.y);
        const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > viewport.width || y > viewport.height) {
          throw new Error("Invalid hosted browser click coordinates.");
        }
        await page.mouse.click(x, y);
        return;
      }
      if (action.type === "text") {
        if (typeof action.text !== "string" || action.text.length < 1 || action.text.length > 2048) {
          throw new Error("Invalid hosted browser text input.");
        }
        await page.keyboard.insertText(action.text);
        return;
      }
      if (action.type === "key") {
        if (typeof action.key !== "string" || !HOSTED_KEYS.has(action.key)) throw new Error("Invalid hosted browser key input.");
        await page.keyboard.press(action.key);
        return;
      }
      if (action.type === "scroll") {
        const deltaY = Number(action.deltaY);
        if (!Number.isFinite(deltaY)) throw new Error("Invalid hosted browser scroll input.");
        await page.mouse.wheel(0, Math.max(-1200, Math.min(1200, deltaY)));
        return;
      }
      throw new Error("Unsupported hosted browser input.");
    },
  };
}

export function createProvider(options = {}) {
  const env = options.env ?? process.env;
  const config = providerConfig(env);
  const credentials = gatewayLoginCredentials(env, Boolean(config.legacyProfileDir));
  const runBrowser = ({ storageState, headless, signal }, action) => config.legacyProfileDir
    ? withLegacyProfileBrowser(config, signal, action)
    : withBrowser(config, { storageState, headless, signal }, action);
  return {
    async connectInteractive({ signal, surface } = {}) {
      return runBrowser({ headless: false, signal }, async ({ context, page }) => {
        try {
          await surface?.attach(hostedBrowserController(page));
          let verificationWasRequired;
          try {
            verificationWasRequired = await waitForInteractiveLogin(page, config, signal, credentials);
          } catch (error) {
            if (error instanceof GatewaySessionExpiredError || error instanceof GatewayTransientError) throw error;
            throw new GatewayTransientError("Gateway interactive sign-in failed before session capture.");
          }
          try {
            await openGatewayIpReport(page, config);
          } catch (error) {
            if (error instanceof GatewaySessionExpiredError || error instanceof GatewayTransientError) throw error;
            throw new GatewayTransientError("Gateway IP Report verification failed after sign-in.");
          }
          const storageState = await context.storageState();
          return { session: { version: 1, storageState }, verificationWasRequired };
        } finally {
          surface?.detach?.();
        }
      });
    },

    async validateSession(session, { signal } = {}) {
      if (!validSession(session)) return false;
      try {
        return await runBrowser({ storageState: session.storageState, headless: config.backgroundHeadless, signal }, async ({ page }) => {
          await ensureDashboardSession(page, config);
          return true;
        });
      } catch (error) {
        if (error instanceof GatewaySessionExpiredError) return false;
        throw error;
      }
    },

    async pullCurrentReports(session, { businessDate, signal } = {}) {
      if (!validSession(session)) throw new GatewaySessionExpiredError();
      if (!validIsoDate(businessDate)) throw new Error("Gateway current pull requires a YYYY-MM-DD business date.");
      return runBrowser({ storageState: session.storageState, headless: config.backgroundHeadless, signal }, async ({ page }) => {
        const identity = await openGatewayIpReport(page, config);
        const entries = await readWeeklyEntries(page, identity.uuid);
        const current = entries.find((entry) => entry.date === identity.gatewayDate);
        if (!current) throw new GatewayTransientError("Gateway current weekly identity was not found in its navigation.");
        const plan = ["wtd", "mtd", "ytd"].map((periodType) => ({ periodType, entry: current }));
        const reports = [];
        for (const item of plan) {
          throwIfAborted(signal);
          reports.push(await reportForPlanItem(
            page,
            config,
            identity.uuid,
            businessDate,
            item,
            { currentWtd: true },
          ));
        }
        return reports;
      });
    },

    async listHistoricalReports(session, { from, through, signal } = {}) {
      if (!validSession(session)) throw new GatewaySessionExpiredError();
      if (!validIsoDate(from) || !validIsoDate(through) || through < from) {
        throw new Error("Gateway historical pull requires a valid YYYY-MM-DD range.");
      }
      return runBrowser({ storageState: session.storageState, headless: config.backgroundHeadless, signal }, async ({ page }) => {
        const identity = await openGatewayIpReport(page, config);
        const entries = await readWeeklyEntries(page, identity.uuid);
        const plan = historicalPlan(entries, from, through);
        if (plan.length === 0) throw new GatewayTransientError("Gateway did not expose any historical report weeks in the requested range.");
        const reports = [];
        for (const item of plan) {
          throwIfAborted(signal);
          reports.push(await reportForPlanItem(page, config, identity.uuid, through, item));
        }
        return reports;
      });
    },
  };
}

export const __test = {
  assertAggregateEvidence,
  gatewayLoginCredentials,
  historicalPlan,
  normalizeGatewayDate,
  normalizeWeeklyEntries,
  parseMonthId,
  periodUrl,
  providerConfig,
  workbookToGatewayCsv,
  hostedBrowserController,
};
