import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { GatewaySessionExpiredError, GatewayTransientError } from "../engine.mjs";

const DEFAULT_HTTP_HELPER_PATH = fileURLToPath(new URL("../../gateway-http-worker/personal_bridge.py", import.meta.url));
const HTTP_HELPER_MAX_STDOUT_BYTES = 256 * 1024 * 1024;
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
function providerConfig(env = process.env) {
  return {
    httpPythonPath: env.GATEWAY_RUNNER_GATEWAY_HTTP_PYTHON?.trim() || "python",
    httpHelperPath: env.GATEWAY_RUNNER_GATEWAY_HTTP_HELPER_PATH?.trim() || DEFAULT_HTTP_HELPER_PATH,
  };
}

function helperEnvironment(env = process.env) {
  const allowed = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "CURL_CA_BUNDLE",
  ];
  return Object.fromEntries(allowed.flatMap((name) => env[name] == null ? [] : [[name, env[name]]]));
}

function helperProtocolError(message = "Gateway HTTP helper returned an invalid response.") {
  return new GatewayTransientError(message);
}

function helperFailure(payload) {
  const failures = Array.isArray(payload?.failures) ? payload.failures : [];
  const failure = failures.find((item) => item && item.periodType == null) ?? failures[0] ?? payload;
  return {
    code: typeof failure?.errorCode === "string"
      ? failure.errorCode
      : typeof failure?.code === "string" ? failure.code : "http_helper_failure",
    retryable: failure?.retryable !== false,
    needsReconnect: failure?.needsReconnect === true,
  };
}

function mapHelperFailure(payload) {
  const failure = helperFailure(payload);
  const code = failure.code;
  if (failure.needsReconnect || code === "session_expired" || code === "authentication_failed") {
    return new GatewaySessionExpiredError();
  }
  if (code === "historical_not_supported") {
    const error = new GatewayTransientError("Gateway HTTP helper does not support historical pulls.");
    error.code = code;
    return error;
  }
  const error = failure.retryable === false
    ? new Error("Gateway HTTP helper operation failed.")
    : new GatewayTransientError("Gateway HTTP helper operation failed.");
  error.code = code;
  error.retryable = failure.retryable;
  return error;
}

function parseHelperResponse(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw helperProtocolError();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.ok !== "boolean") {
    throw helperProtocolError();
  }
  return payload;
}

function reportHelperPayload(payload) {
  if (!Array.isArray(payload?.reports) || !Array.isArray(payload?.failures)) throw helperProtocolError();
  return payload;
}

function runHttpHelperProcess(config, request, { signal, spawnImpl = spawn, env = process.env } = {}) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdoutBytes = 0;
    const stdout = [];
    const child = spawnImpl(config.httpPythonPath, [config.httpHelperPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: helperEnvironment(env),
    });
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      callback(value);
    };
    const fail = (error) => finish(reject, error);
    const onAbort = () => {
      child.kill("SIGTERM");
      fail(abortReason(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stderr?.resume?.();
    child.stdout?.on("data", (chunk) => {
      if (settled) return;
      const bytes = Buffer.from(chunk);
      stdoutBytes += bytes.length;
      if (stdoutBytes > HTTP_HELPER_MAX_STDOUT_BYTES) {
        child.kill("SIGTERM");
        fail(helperProtocolError("Gateway HTTP helper response exceeded the allowed size."));
        return;
      }
      stdout.push(bytes);
    });
    child.once("error", () => fail(new GatewayTransientError("Gateway HTTP helper could not be started.")));
    child.once("close", (code) => {
      if (settled) return;
      const raw = Buffer.concat(stdout).toString("utf8").trim();
      try {
        const payload = parseHelperResponse(raw);
        if (code !== 0) throw helperProtocolError();
        finish(resolve, payload);
      } catch (error) {
        fail(error);
      }
    });
    child.stdin?.once("error", () => {
      if (!settled) fail(new GatewayTransientError("Gateway HTTP helper input pipe failed."));
    });
    child.stdin?.end(JSON.stringify({
      ...request,
    }));
  });
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

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const instant = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
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
  const npnCounts = new Map();
  let fileDate = null;
  for (const row of rows.slice(1)) {
    const producerNpn = formatIdentifier(get(row, "Producer NPN"));
    if (!cleanText(get(row, "Producer")) || !producerNpn) continue;
    const rowDate = normalizeGatewayDate(get(row, "File Date"));
    if (!rowDate) throw new Error("Gateway workbook contains an invalid File Date.");
    if (fileDate && fileDate !== rowDate) throw new Error("Gateway workbook contains inconsistent File Date values.");
    fileDate = rowDate;
    npnCounts.set(producerNpn, (npnCounts.get(producerNpn) ?? 0) + 1);
    output.push([
      usDate(rowDate),
      cleanText(get(row, "Producer")),
      producerNpn,
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
    uniqueNpnCount: npnCounts.size,
    duplicateNpnValues: [...npnCounts.values()].filter((count) => count > 1).length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    byteCount: buffer.length,
    csvText: [REQUIRED_COLUMNS, ...output].map((row) => row.map(csvEscape).join(",")).join("\n"),
  };
}

function sessionStateForHelper(session) {
  if (session?.version === 2 && session.sessionState && Array.isArray(session.sessionState.cookies)) {
    return { sessionState: session.sessionState };
  }
  if (session?.version === 1 && session.storageState && Array.isArray(session.storageState.cookies)) {
    return { storageState: session.storageState };
  }
  return null;
}

function validSession(session) {
  return sessionStateForHelper(session) != null;
}

function normalizeHttpReport(report, acquisitionDate) {
  if (!report || typeof report !== "object" || !["wtd", "mtd", "ytd"].includes(report.periodType)) {
    throw helperProtocolError("Gateway HTTP helper returned an invalid report.");
  }
  if (!validIsoDate(report.coverage?.gatewayReportDate)) {
    throw helperProtocolError("Gateway HTTP helper omitted the upstream report identity date.");
  }
  const rawXlsxBase64 = report.artifact?.rawXlsxBase64;
  if (typeof rawXlsxBase64 !== "string" || !rawXlsxBase64) {
    throw helperProtocolError("Gateway HTTP helper omitted canonical XLSX evidence.");
  }
  let raw;
  let parsed;
  try {
    raw = Buffer.from(rawXlsxBase64, "base64");
    parsed = workbookToGatewayCsv(raw);
  } catch {
    throw helperProtocolError("Gateway HTTP helper returned invalid canonical XLSX evidence.");
  }
  const artifact = {
    providerType: "http",
    sourceFileName: String(report.sourceFileName || `gateway-${report.periodType}-${acquisitionDate}.xlsx`)
      .replace(/\.csv$/i, ".xlsx"),
    sourceSha256: parsed.sha256,
    sourceByteCount: parsed.byteCount,
    contentType: typeof report.artifact.contentType === "string" && report.artifact.contentType
      ? report.artifact.contentType
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileDate: parsed.fileDate,
    rowsSeen: parsed.rowCount,
    uniqueNpnCount: parsed.uniqueNpnCount,
    duplicateNpnValues: parsed.duplicateNpnValues,
    rawXlsxBase64,
  };
  for (const [field, expected] of [
    ["sourceSha256", artifact.sourceSha256],
    ["sourceByteCount", artifact.sourceByteCount],
    ["fileDate", artifact.fileDate],
    ["rowsSeen", artifact.rowsSeen],
    ["uniqueNpnCount", artifact.uniqueNpnCount],
    ["duplicateNpnValues", artifact.duplicateNpnValues],
  ]) {
    if (report.artifact[field] != null && report.artifact[field] !== expected) {
      throw helperProtocolError("Gateway HTTP helper artifact evidence did not match the canonical workbook.");
    }
  }
  if (report.periodType === "wtd" && report.coverage?.weekStart !== parsed.fileDate) {
    throw helperProtocolError("Gateway HTTP helper WTD coverage did not match the canonical workbook.");
  }
  if (report.periodType !== "wtd" && report.coverage?.periodStart !== parsed.fileDate) {
    throw helperProtocolError("Gateway HTTP helper aggregate coverage did not match the canonical workbook.");
  }
  return {
    ...report,
    csvText: parsed.csvText,
    reportDate: acquisitionDate,
    sourceFileName: String(report.sourceFileName || `gateway-${report.periodType}-${acquisitionDate}.xlsx`)
      .replace(/\.(xlsx|xls)$/i, ".csv"),
    artifact,
  };
}

function normalizeHelperFailures(failures, { historical = false } = {}) {
  if (failures == null) return [];
  if (!Array.isArray(failures)) throw helperProtocolError();
  return failures.map((failure) => {
    if (!failure || !["wtd", "mtd", "ytd"].includes(failure.periodType)) throw helperProtocolError();
    if (historical && !validIsoDate(failure.gatewayReportDate)) {
      throw helperProtocolError("Gateway HTTP helper historical failure omitted its report identity date.");
    }
    const errorCode = typeof failure.errorCode === "string"
      ? failure.errorCode
      : typeof failure.code === "string" ? failure.code : "gateway_http_period_failure";
    return {
      periodType: failure.periodType,
      ...(validIsoDate(failure.gatewayReportDate) ? { gatewayReportDate: failure.gatewayReportDate } : {}),
      errorCode,
      retryable: failure.retryable !== false,
      needsReconnect: failure.needsReconnect === true,
    };
  });
}

export function createProvider(options = {}) {
  const env = options.env ?? process.env;
  const config = providerConfig(env);
  const httpHelper = options.httpHelper ?? ((request, { signal } = {}) => runHttpHelperProcess(config, request, {
    signal,
    spawnImpl: options.spawnImpl ?? spawn,
    env,
  }));

  const pullHttpHistoricalPages = async (session, from, through, signal) => {
    const helperState = sessionStateForHelper(session);
    if (!helperState) throw new GatewaySessionExpiredError();
    const reports = [];
    const failures = [];
    let offset = 0;
    for (let page = 0; page < 1024; page += 1) {
      const payload = reportHelperPayload(await httpHelper({
        operation: "historical",
        ...helperState,
        from,
        through,
        historicalOffset: offset,
      }, { signal }));
      if (!payload.ok && payload.failures.some((failure) => failure?.periodType == null)) {
        const failure = helperFailure(payload);
        const sessionExpired = failure.needsReconnect ||
          failure.code === "session_expired" || failure.code === "authentication_failed";
        if (reports.length > 0 && sessionExpired) {
          // A personal Gateway session can expire between historical pages. The
          // already-normalized earlier pages are immutable evidence and must still
          // reach the engine so they can be persisted before this claim is fenced
          // as needs_reconnect. The remaining history has no trustworthy period
          // identity once page establishment itself fails, so expose one unscoped
          // historical failure rather than discarding the successful siblings.
          failures.push({
            periodType: "historical",
            errorCode: failure.code,
            retryable: false,
            needsReconnect: true,
          });
          return { reports, failures, provider: "http" };
        }
        throw mapHelperFailure(payload);
      }
      reports.push(...payload.reports.map((report) => normalizeHttpReport(report, through)));
      failures.push(...normalizeHelperFailures(payload.failures, { historical: true }));
      const nextOffset = payload.nextHistoricalOffset;
      if (nextOffset == null) return { reports, failures, provider: "http" };
      if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset > 100_000) {
        throw helperProtocolError("Gateway HTTP helper returned an invalid historical cursor.");
      }
      offset = nextOffset;
    }
    throw helperProtocolError("Gateway HTTP helper exceeded the historical page limit.");
  };

  return {
    async connectInteractive({ signal, surface } = {}) {
      if (typeof surface?.prompt !== "function") throw new Error("Gateway interactive surface is unavailable.");
      let credentials = await surface.prompt({ kind: "credentials" });
      if (!credentials || typeof credentials.email !== "string" || typeof credentials.password !== "string") {
        throw new Error("Gateway credentials prompt returned invalid input.");
      }
      let payload;
      try {
        payload = await httpHelper({
          operation: "connect_begin",
          email: credentials.email,
          password: credentials.password,
        }, { signal });
      } finally {
        credentials = null;
      }

      let verificationWasRequired = false;
      for (let step = 0; step < 16; step += 1) {
        if (!payload?.ok) {
          const failure = helperFailure(payload);
          const retryableChallenge =
            failure.code === "authentication_failed" &&
            failure.needsReconnect === false &&
            ["otp_required", "setup_phone", "setup_email"].includes(payload?.status) &&
            payload?.state && typeof payload.state === "object";
          if (!retryableChallenge) throw mapHelperFailure(payload);
        }
        if (payload.status === "connected") {
          const session = payload.session;
          if (
            session?.version !== 2 ||
            !session.sessionState ||
            !Array.isArray(session.sessionState.cookies)
          ) throw helperProtocolError("Gateway HTTP connect omitted its session state.");
          return { session, verificationWasRequired };
        }
        if (!["otp_required", "setup_phone", "setup_email"].includes(payload.status) || !payload.state || typeof payload.state !== "object") {
          throw helperProtocolError("Gateway HTTP connect returned an unsupported challenge state.");
        }

        verificationWasRequired = true;
        const challengeState = payload.state;
        if (payload.status === "otp_required") {
          let code = await surface.prompt({ kind: "otp" });
          try {
            payload = await httpHelper({
              operation: "connect_step",
              state: challengeState,
              action: "verify",
              code,
            }, { signal });
          } finally {
            code = null;
          }
          continue;
        }

        const kind = payload.status === "setup_phone" ? "phone" : "email";
        let value = await surface.prompt({ kind });
        try {
          payload = await httpHelper({
            operation: "connect_step",
            state: challengeState,
            action: "continue",
            value,
          }, { signal });
        } finally {
          value = null;
        }
      }
      throw helperProtocolError("Gateway HTTP connect exceeded the allowed verification steps.");
    },

    async validateSession(session, { signal } = {}) {
      const helperState = sessionStateForHelper(session);
      if (!helperState) return false;
      try {
        const payload = reportHelperPayload(await httpHelper({
          operation: "validate",
          ...helperState,
        }, { signal }));
        if (!payload.ok) throw mapHelperFailure(payload);
        return true;
      } catch (error) {
        if (error instanceof GatewaySessionExpiredError) return false;
        throw error;
      }
    },

    async pullCurrentReports(session, { businessDate, signal } = {}) {
      const helperState = sessionStateForHelper(session);
      if (!helperState) throw new GatewaySessionExpiredError();
      if (!validIsoDate(businessDate)) throw new Error("Gateway current pull requires a YYYY-MM-DD business date.");
      const payload = reportHelperPayload(await httpHelper({
        operation: "current",
        ...helperState,
        businessDate,
      }, { signal }));
      if (!payload.ok && payload.failures.some((failure) => failure?.periodType == null)) throw mapHelperFailure(payload);
      return {
        reports: payload.reports.map((report) => normalizeHttpReport(report, businessDate)),
        failures: normalizeHelperFailures(payload.failures),
        provider: "http",
      };
    },

    async listHistoricalReports(session, { from, through, signal } = {}) {
      if (!validSession(session)) throw new GatewaySessionExpiredError();
      if (!validIsoDate(from) || !validIsoDate(through) || through < from) {
        throw new Error("Gateway historical pull requires a valid YYYY-MM-DD range.");
      }
      return pullHttpHistoricalPages(session, from, through, signal);
    },
  };
}

export const __test = {
  normalizeGatewayDate,
  providerConfig,
  helperEnvironment,
  parseHelperResponse,
  reportHelperPayload,
  sessionStateForHelper,
  validSession,
  normalizeHttpReport,
  normalizeHelperFailures,
  runHttpHelperProcess,
  workbookToGatewayCsv,
};
