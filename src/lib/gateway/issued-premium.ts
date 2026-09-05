import { createHash } from "crypto";

export const GATEWAY_ISSUED_PREMIUM_PERIODS = ["wtd", "mtd", "ytd"] as const;

export type GatewayIssuedPremiumPeriod =
  (typeof GATEWAY_ISSUED_PREMIUM_PERIODS)[number];

export type GatewayIssuedPremiumStatus =
  | "pending"
  | "imported"
  | "no_new_report"
  | "failed"
  | "skipped";

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
] as const;

export type ParsedGatewayIssuedPremiumRow = {
  periodType: GatewayIssuedPremiumPeriod;
  reportDate: string;
  periodStart: string | null;
  gatewayLabel: string | null;
  producer: string;
  producerNpn: string;
  email: string | null;
  upline: string | null;
  uplineNpn: string | null;
  agency: string | null;
  personalIpCents: number;
  teamIpCents: number;
  firstLegProducer: string | null;
  firstLegNpn: string | null;
  firstLegPercent: number | null;
  outsideFirstLegCents: number;
};

export type GatewayIssuedPremiumParseResult = {
  periodType: GatewayIssuedPremiumPeriod;
  reportDate: string;
  periodStart: string | null;
  gatewayLabel: string | null;
  sourceFileName: string | null;
  sourceChecksum: string;
  rows: ParsedGatewayIssuedPremiumRow[];
};

export type GatewayIssuedPremiumImportResult = {
  periodType: GatewayIssuedPremiumPeriod;
  status: GatewayIssuedPremiumStatus;
  dryRun: boolean;
  importId: string | null;
  reportDate: string | null;
  periodStart: string | null;
  gatewayLabel: string | null;
  sourceFileName: string | null;
  sourceChecksum: string | null;
  rowsSeen: number;
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  skippedCount: number;
  verifiedSubmittedCount: number;
  message?: string;
  samples: {
    unmatched: Array<{ npn: string; producer: string }>;
    ambiguous: Array<{ npn: string; producer: string; reason: string }>;
    matched: Array<{ npn: string; producer: string; personId: string }>;
  };
};

export function isGatewayIssuedPremiumPeriod(
  value: string | null,
): value is GatewayIssuedPremiumPeriod {
  return (
    value === "wtd" ||
    value === "mtd" ||
    value === "ytd"
  );
}

export function normalizeNpn(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function parseMoneyToCents(value: string | null | undefined): number {
  const cleaned = String(value ?? "").replace(/[$,\s]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  if (n < 0) {
    throw new Error(`Negative money value is not allowed: ${value}`);
  }
  return Math.round(n * 100);
}

function parsePercent(value: string | null | undefined): number | null {
  const cleaned = String(value ?? "").replace(/[%\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid percent value: ${value}`);
  }
  if (n < 0 || n > 100) {
    throw new Error(`Percent must be between 0 and 100: ${value}`);
  }
  return n;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseUsDate(value: string | null | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function extractReportDate(sourceFileName?: string | null): string | null {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(sourceFileName ?? "");
  return m?.[1] ?? null;
}

function monthName(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  return [
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
  ][month - 1] ?? isoDate;
}

function defaultGatewayLabel(
  periodType: GatewayIssuedPremiumPeriod,
  periodStart: string | null,
  reportDate: string,
): string {
  if (periodType === "wtd" && periodStart) {
    const day = Number(periodStart.slice(8, 10));
    return `${monthName(periodStart)} Week ${Math.max(1, Math.ceil(day / 7))}`;
  }
  if (periodType === "mtd") return `${monthName(periodStart ?? reportDate)} MTD`;
  return `${reportDate.slice(0, 4)} YTD`;
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function parseGatewayIssuedPremiumCsv(
  csvText: string,
  opts: {
    periodType: GatewayIssuedPremiumPeriod;
    reportDate?: string | null;
    sourceFileName?: string | null;
    gatewayLabel?: string | null;
  },
): GatewayIssuedPremiumParseResult {
  const parsed = parseCsvRows(csvText);
  if (parsed.length < 2) {
    throw new Error("Gateway report is empty or missing data rows.");
  }

  const headers = parsed[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  const column = new Map(headers.map((h, i) => [h, i]));
  const missing = REQUIRED_COLUMNS.filter((h) => !column.has(h));
  if (missing.length) {
    throw new Error(`Gateway report is missing required columns: ${missing.join(", ")}`);
  }

  const reportDate = opts.reportDate ?? extractReportDate(opts.sourceFileName);
  if (!reportDate) {
    throw new Error("Could not determine Gateway report date from options or file name.");
  }

  const dataRows = parsed.slice(1);
  const first = dataRows[0] ?? [];
  const periodStart = parseUsDate(first[column.get("File Date")!]);
  if (!periodStart) throw new Error("Gateway report has an invalid File Date.");
  const gatewayLabel =
    opts.gatewayLabel ?? defaultGatewayLabel(opts.periodType, periodStart, reportDate);

  const rows = dataRows.map((cells, index): ParsedGatewayIssuedPremiumRow => {
    const get = (name: (typeof REQUIRED_COLUMNS)[number]) => cells[column.get(name)!] ?? "";
    const rowPeriodStart = parseUsDate(get("File Date"));
    if (!rowPeriodStart) throw new Error(`Gateway row ${index + 2} has an invalid File Date.`);
    if (rowPeriodStart !== periodStart) {
      throw new Error("Gateway report has inconsistent File Date values.");
    }
    const producerNpn = normalizeNpn(get("Producer NPN"));
    if (!producerNpn) {
      throw new Error(`Gateway row ${index + 2} is missing Producer NPN.`);
    }

    const producer = cleanText(get("Producer"));
    if (!producer) {
      throw new Error(`Gateway row ${index + 2} is missing Producer.`);
    }

    return {
      periodType: opts.periodType,
      reportDate,
      periodStart,
      gatewayLabel,
      producer,
      producerNpn,
      email: cleanText(get("Email")),
      upline: cleanText(get("Upline")),
      uplineNpn: cleanText(normalizeNpn(get("Upline NPN"))),
      agency: cleanText(get("Agency")),
      personalIpCents: parseMoneyToCents(get("All Lines Personal")),
      teamIpCents: parseMoneyToCents(get("All Lines Team")),
      firstLegProducer: cleanText(get("1st Leg Producer")),
      firstLegNpn: cleanText(normalizeNpn(get("1st Leg NPN"))),
      firstLegPercent: parsePercent(get("1st Leg %")),
      outsideFirstLegCents: parseMoneyToCents(get("Outside 1st Leg")),
    };
  });

  return {
    periodType: opts.periodType,
    reportDate,
    periodStart,
    gatewayLabel,
    sourceFileName: opts.sourceFileName ?? null,
    sourceChecksum: sha256(csvText),
    rows,
  };
}
