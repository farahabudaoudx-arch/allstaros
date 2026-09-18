import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createProvider, __test } from "./gateway.mjs";

function minimalWorkbook(rows) {
  const shared = [];
  const sharedIndex = new Map();
  const stringCell = (ref, value) => {
    if (!sharedIndex.has(value)) {
      sharedIndex.set(value, shared.length);
      shared.push(value);
    }
    return `<c r="${ref}" t="s"><v>${sharedIndex.get(value)}</v></c>`;
  };
  const cell = (ref, value) => typeof value === "number"
    ? `<c r="${ref}"><v>${value}</v></c>`
    : stringCell(ref, String(value));
  const letters = (index) => String.fromCharCode(65 + index);
  const sheetRows = rows.map((row, rowIndex) =>
    `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => cell(`${letters(columnIndex)}${rowIndex + 1}`, value)).join("")}</row>`,
  ).join("");
  const sharedXml = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((value) => `<si><t>${value}</t></si>`).join("")}</sst>`;
  return Buffer.from(zipSync({
    "xl/workbook.xml": strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8(sharedXml),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
  }));
}

const REPORT_HEADERS = [
  "File Date", "Producer", "Producer NPN", "Email", "Upline", "Upline NPN", "Agency",
  "All Lines Personal", "All Lines Team", "1st Leg Producer", "1st Leg NPN", "1st Leg %", "Outside 1st Leg",
];

function helperReport(periodType, fileDate, coverage, reportDate = "2026-02-23") {
  const workbook = minimalWorkbook([
    REPORT_HEADERS,
    [fileDate, `Producer ${periodType}`, 999000001, `${periodType}@example.invalid`, "Upline", 1, "Agency", 100, 250, "Leg", 2, 0.2, 50],
  ]);
  const parsed = __test.workbookToGatewayCsv(workbook);
  return {
    periodType,
    reportDate,
    csvText: "ignored-helper-csv",
    sourceFileName: `${periodType}.csv`,
    gatewayLabel: periodType.toUpperCase(),
    coverage,
    artifact: {
      sourceSha256: parsed.sha256,
      sourceByteCount: parsed.byteCount,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileDate: parsed.fileDate,
      rowsSeen: parsed.rowCount,
      uniqueNpnCount: parsed.uniqueNpnCount,
      duplicateNpnValues: parsed.duplicateNpnValues,
      rawXlsxBase64: workbook.toString("base64"),
    },
  };
}

function helperTrio() {
  return [
    helperReport("wtd", "2026-02-23", {
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      gatewayReportDate: "2026-02-23",
      weekStart: "2026-02-23",
      weekOrdinal: 4,
      periodFinal: true,
    }),
    helperReport("mtd", "2026-02-01", {
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      gatewayReportDate: "2026-02-23",
    }),
    helperReport("ytd", "2026-01-01", {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      gatewayReportDate: "2026-02-23",
    }),
  ];
}

const newSession = {
  version: 2,
  sessionState: { version: 1, cookies: [{ name: "sid", value: "person-a" }] },
};
const legacySession = {
  version: 1,
  storageState: { cookies: [{ name: "sid", value: "legacy-person" }], origins: [] },
};

describe("HTTP-only Gateway provider", () => {
  it("contains no Playwright, Chromium, hosted-browser, or report-browser runtime path", () => {
    const source = readFileSync(new URL("./gateway.mjs", import.meta.url), "utf8");
    for (const forbidden of [
      "playwright",
      "chromium",
      "browserBackground",
      "hostedBrowserController",
      "captureFrame",
      "recoverPartialWithBrowser",
      "withBrowser(",
    ]) expect(source.toLowerCase()).not.toContain(forbidden.toLowerCase());
  });

  it("keeps provider configuration limited to the one-shot HTTP helper", () => {
    expect(__test.providerConfig({
      GATEWAY_RUNNER_GATEWAY_HTTP_PYTHON: "python3",
      GATEWAY_RUNNER_GATEWAY_HTTP_HELPER_PATH: "/tmp/bridge.py",
    })).toEqual({ httpPythonPath: "python3", httpHelperPath: "/tmp/bridge.py" });
  });

  it("converts canonical Gateway workbook evidence and preserves File Date", () => {
    const workbook = minimalWorkbook([
      REPORT_HEADERS,
      [46256, "Acceptance Producer", 999000001, "acceptance@example.invalid", "Upline", 1, "Agency", 100, 250, "Leg", 2, 0.2, 50],
    ]);
    const parsed = __test.workbookToGatewayCsv(workbook);
    expect(parsed.fileDate).toBe("2026-08-22");
    expect(parsed.rowCount).toBe(1);
    expect(parsed.csvText).toContain("8/22/2026,Acceptance Producer,999000001");
  });

  it("connects without 2FA using one credentials prompt and returns the generic HTTP session", async () => {
    const httpHelper = vi.fn(async (request) => {
      expect(request).toEqual({
        operation: "connect_begin",
        email: "member@example.invalid",
        password: "private-password",
      });
      return { ok: true, status: "connected", session: newSession };
    });
    const surface = { prompt: vi.fn(async () => ({ email: "member@example.invalid", password: "private-password" })) };
    const provider = createProvider({ httpHelper, env: {} });

    await expect(provider.connectInteractive({ surface })).resolves.toEqual({
      session: newSession,
      verificationWasRequired: false,
    });
    expect(surface.prompt).toHaveBeenCalledTimes(1);
    expect(surface.prompt).toHaveBeenCalledWith({ kind: "credentials" });
  });

  it("keeps 2FA challenge state provider-local while prompting only for the OTP value", async () => {
    const opaqueState = { version: 1, token: "private-challenge-token", phase: "otp_required" };
    const httpHelper = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: "otp_required", state: opaqueState })
      .mockResolvedValueOnce({ ok: true, status: "connected", session: newSession });
    const surface = { prompt: vi.fn()
      .mockResolvedValueOnce({ email: "member@example.invalid", password: "private-password" })
      .mockResolvedValueOnce("123456") };
    const provider = createProvider({ httpHelper, env: {} });

    await expect(provider.connectInteractive({ surface })).resolves.toMatchObject({ verificationWasRequired: true });
    expect(surface.prompt.mock.calls).toEqual([
      [{ kind: "credentials" }],
      [{ kind: "otp" }],
    ]);
    expect(JSON.stringify(surface.prompt.mock.calls)).not.toContain("private-challenge-token");
    expect(httpHelper.mock.calls[1][0]).toEqual({
      operation: "connect_step",
      state: opaqueState,
      action: "verify",
      code: "123456",
    });
  });

  it("drives phone then email setup entirely through HTTP connect steps", async () => {
    const phoneSetup = { id: "phone-state" };
    const phoneOtp = { id: "phone-otp-state" };
    const emailSetup = { id: "email-state" };
    const emailOtp = { id: "email-otp-state" };
    const httpHelper = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: "setup_phone", state: phoneSetup })
      .mockResolvedValueOnce({ ok: true, status: "otp_required", state: phoneOtp })
      .mockResolvedValueOnce({ ok: true, status: "setup_email", state: emailSetup })
      .mockResolvedValueOnce({ ok: true, status: "otp_required", state: emailOtp })
      .mockResolvedValueOnce({ ok: true, status: "connected", session: newSession });
    const surface = { prompt: vi.fn()
      .mockResolvedValueOnce({ email: "member@example.invalid", password: "private-password" })
      .mockResolvedValueOnce("+15555550123")
      .mockResolvedValueOnce("111111")
      .mockResolvedValueOnce("verify@example.invalid")
      .mockResolvedValueOnce("222222") };
    const provider = createProvider({ httpHelper, env: {} });

    await expect(provider.connectInteractive({ surface })).resolves.toMatchObject({ verificationWasRequired: true });
    expect(surface.prompt.mock.calls.map(([prompt]) => prompt.kind)).toEqual([
      "credentials", "phone", "otp", "email", "otp",
    ]);
    expect(httpHelper.mock.calls.slice(1).map(([request]) => request)).toEqual([
      { operation: "connect_step", state: phoneSetup, action: "continue", value: "+15555550123" },
      { operation: "connect_step", state: phoneOtp, action: "verify", code: "111111" },
      { operation: "connect_step", state: emailSetup, action: "continue", value: "verify@example.invalid" },
      { operation: "connect_step", state: emailOtp, action: "verify", code: "222222" },
    ]);
  });

  it("keeps the signed hosted session alive and re-prompts a rejected OTP", async () => {
    const firstState = { id: "challenge-1" };
    const retryState = { id: "challenge-retry" };
    const httpHelper = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: "otp_required", state: firstState })
      .mockResolvedValueOnce({
        ok: false,
        status: "otp_required",
        state: retryState,
        failures: [{ errorCode: "authentication_failed", retryable: false, needsReconnect: false }],
      })
      .mockResolvedValueOnce({ ok: true, status: "connected", session: newSession });
    const surface = { prompt: vi.fn()
      .mockResolvedValueOnce({ email: "member@example.invalid", password: "private-password" })
      .mockResolvedValueOnce("111111")
      .mockResolvedValueOnce("222222") };
    const provider = createProvider({ httpHelper, env: {} });

    await expect(provider.connectInteractive({ surface })).resolves.toMatchObject({ session: newSession });
    expect(surface.prompt.mock.calls.map(([prompt]) => prompt.kind)).toEqual(["credentials", "otp", "otp"]);
    expect(httpHelper.mock.calls[2][0]).toMatchObject({ state: retryState, code: "222222" });
  });

  it("uses sessionState for new sessions and storageState only for legacy encrypted sessions", async () => {
    const httpHelper = vi.fn(async () => ({ ok: true, reports: helperTrio(), failures: [] }));
    const provider = createProvider({ httpHelper, env: {} });

    await provider.pullCurrentReports(newSession, { businessDate: "2026-02-23" });
    await provider.pullCurrentReports(legacySession, { businessDate: "2026-02-23" });

    expect(httpHelper.mock.calls[0][0]).toMatchObject({ operation: "current", sessionState: newSession.sessionState });
    expect(httpHelper.mock.calls[0][0]).not.toHaveProperty("storageState");
    expect(httpHelper.mock.calls[1][0]).toMatchObject({ operation: "current", storageState: legacySession.storageState });
    expect(httpHelper.mock.calls[1][0]).not.toHaveProperty("sessionState");
  });

  it("preserves HTTP current partial semantics without any alternate runtime fallback", async () => {
    const httpHelper = vi.fn(async () => ({
      ok: true,
      reports: helperTrio().slice(0, 2),
      failures: [{ periodType: "ytd", errorCode: "transport_failure", retryable: true, needsReconnect: false }],
    }));
    const provider = createProvider({ httpHelper, env: {} });

    const result = await provider.pullCurrentReports(newSession, { businessDate: "2026-02-23" });
    expect(result.provider).toBe("http");
    expect(result.reports.map((item) => item.periodType)).toEqual(["wtd", "mtd"]);
    expect(result.reports.every((item) => item.artifact.providerType === "http")).toBe(true);
    expect(result.failures).toEqual([{
      periodType: "ytd",
      errorCode: "transport_failure",
      retryable: true,
      needsReconnect: false,
    }]);
    expect(httpHelper).toHaveBeenCalledOnce();
  });

  it("fails closed when the HTTP helper itself fails instead of invoking a browser fallback", async () => {
    const provider = createProvider({
      httpHelper: vi.fn(async () => { throw new Error("helper unavailable"); }),
      env: {},
    });
    await expect(provider.pullCurrentReports(newSession, { businessDate: "2026-02-23" }))
      .rejects.toThrow("helper unavailable");
  });

  it("pages historical HTTP acquisition and preserves each immutable earlier snapshot", async () => {
    const first = helperReport("wtd", "2026-02-16", {
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      gatewayReportDate: "2026-02-20",
      weekStart: "2026-02-16",
      weekOrdinal: 3,
      periodFinal: false,
    });
    const second = helperReport("wtd", "2026-02-23", {
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      gatewayReportDate: "2026-02-23",
      weekStart: "2026-02-23",
      weekOrdinal: 4,
      periodFinal: true,
    });
    const offsets = [];
    const httpHelper = vi.fn(async (payload) => {
      offsets.push(payload.historicalOffset);
      if (payload.historicalOffset === 0) return { ok: true, reports: [first], failures: [], nextHistoricalOffset: 1 };
      return { ok: true, reports: [second], failures: [], nextHistoricalOffset: null };
    });
    const provider = createProvider({ httpHelper, env: {} });

    const result = await provider.listHistoricalReports(newSession, { from: "2026-01-01", through: "2026-02-23" });
    expect(offsets).toEqual([0, 1]);
    expect(result.reports.map((item) => item.coverage.gatewayReportDate)).toEqual(["2026-02-20", "2026-02-23"]);
    expect(result.failures).toEqual([]);
  });

  it("preserves earlier historical pages when the personal HTTP session expires on a later page", async () => {
    const first = helperReport("wtd", "2026-02-16", {
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      gatewayReportDate: "2026-02-20",
      weekStart: "2026-02-16",
      weekOrdinal: 3,
      periodFinal: false,
    });
    const httpHelper = vi.fn(async (payload) => payload.historicalOffset === 0
      ? { ok: true, reports: [first], failures: [], nextHistoricalOffset: 1 }
      : {
          ok: false,
          reports: [],
          failures: [{ errorCode: "authentication_failed", retryable: false, needsReconnect: true }],
        });
    const provider = createProvider({ httpHelper, env: {} });

    const result = await provider.listHistoricalReports(newSession, { from: "2026-01-01", through: "2026-02-23" });
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].coverage.gatewayReportDate).toBe("2026-02-20");
    expect(result.failures).toEqual([{
      periodType: "historical",
      errorCode: "authentication_failed",
      retryable: false,
      needsReconnect: true,
    }]);
  });

  it("parses connect responses without requiring report arrays", () => {
    expect(__test.parseHelperResponse(JSON.stringify({
      ok: true,
      status: "otp_required",
      state: { id: "opaque" },
    }))).toEqual({ ok: true, status: "otp_required", state: { id: "opaque" } });
    expect(() => __test.reportHelperPayload({ ok: true, status: "otp_required" })).toThrow();
  });

  it("passes generic session state through stdin while stripping secrets from helper environment and errors", async () => {
    let privateInput = "";
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        privateInput += chunk.toString();
        callback();
      },
    });
    child.kill = vi.fn();
    const spawnImpl = vi.fn(() => {
      queueMicrotask(() => {
        child.stderr.end("private-stderr-marker");
        child.stdout.end("not-json");
        child.emit("close", 1);
      });
      return child;
    });
    const config = __test.providerConfig({ GATEWAY_RUNNER_GATEWAY_HTTP_PYTHON: "python" });
    let caught;
    try {
      await __test.runHttpHelperProcess(config, {
        operation: "validate",
        sessionState: { cookies: [{ name: "sid", value: "personal-cookie-marker" }] },
      }, {
        spawnImpl,
        env: {
          PATH: "safe-path",
          GATEWAY_LOGIN_EMAIL: "should-not-inherit@example.invalid",
          GATEWAY_LOGIN_PASSWORD: "should-not-inherit-password",
          GATEWAY_AGENT_REPORT_TOKEN: "should-not-inherit-token",
          GATEWAY_RUNNER_SESSION_KEY: "should-not-inherit-key",
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).not.toContain("private-stderr-marker");
    const [, , spawnOptions] = spawnImpl.mock.calls[0];
    expect(spawnOptions.env).toEqual({ PATH: "safe-path" });
    expect(JSON.stringify(spawnImpl.mock.calls)).not.toContain("personal-cookie-marker");
    expect(privateInput).toContain("personal-cookie-marker");
  });
});
