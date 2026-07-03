import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

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

type PersonMatchRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  npn: string | null;
  npn_status: string | null;
  status: string | null;
};

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

export type GatewayIssuedPremiumMonitorResult = {
  ok: boolean;
  checkedAt: string;
  staleAfterHours: number;
  pendingAfterMinutes: number;
  latestByPeriod: Record<
    GatewayIssuedPremiumPeriod,
    | {
        id: string;
        status: string;
        report_date: string | null;
        started_at: string;
        finished_at: string | null;
        matched_count: number;
        unmatched_count: number;
        ambiguous_count: number;
      }
    | null
  >;
  stalePeriods: GatewayIssuedPremiumPeriod[];
  failedImports: Array<{
    id: string;
    period_type: string;
    status: string;
    report_date: string | null;
    started_at: string;
    error_message: string | null;
  }>;
  stuckImports: Array<{
    id: string;
    period_type: string;
    status: string;
    report_date: string | null;
    started_at: string;
  }>;
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
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function extractReportDate(sourceFileName?: string | null): string | null {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(sourceFileName ?? "");
  return m?.[1] ?? null;
}

function sourceNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : url;
  } catch {
    return url;
  }
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
  const gatewayLabel =
    opts.gatewayLabel ?? defaultGatewayLabel(opts.periodType, periodStart, reportDate);

  const rows = dataRows.map((cells, index): ParsedGatewayIssuedPremiumRow => {
    const get = (name: (typeof REQUIRED_COLUMNS)[number]) => cells[column.get(name)!] ?? "";
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

function configuredReportUrl(periodType: GatewayIssuedPremiumPeriod): string | null {
  const key = `GATEWAY_ISSUED_PREMIUM_${periodType.toUpperCase()}_URL`;
  return process.env[key] ?? null;
}

function configuredHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const authHeader = process.env.GATEWAY_ISSUED_PREMIUM_AUTH_HEADER;
  if (authHeader) {
    const idx = authHeader.indexOf(":");
    if (idx > 0) {
      headers[authHeader.slice(0, idx).trim()] = authHeader.slice(idx + 1).trim();
    }
  }
  if (process.env.GATEWAY_ISSUED_PREMIUM_COOKIE) {
    headers.Cookie = process.env.GATEWAY_ISSUED_PREMIUM_COOKIE;
  }
  return headers;
}

async function fetchConfiguredGatewayCsv(
  periodType: GatewayIssuedPremiumPeriod,
): Promise<{ csvText: string; sourceFileName: string }> {
  const url = configuredReportUrl(periodType);
  if (!url) {
    throw new Error(
      `Missing GATEWAY_ISSUED_PREMIUM_${periodType.toUpperCase()}_URL. Configure a CSV download URL before enabling this period.`,
    );
  }

  const res = await fetch(url, {
    cache: "no-store",
    headers: configuredHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Gateway ${periodType.toUpperCase()} fetch failed: ${res.status} ${res.statusText}`);
  }

  return {
    csvText: await res.text(),
    sourceFileName: sourceNameFromUrl(url),
  };
}

function limited<T>(items: T[], count = 25): T[] {
  return items.slice(0, count);
}

function buildPersonIndex(people: PersonMatchRow[]): Map<string, PersonMatchRow[]> {
  const byNpn = new Map<string, PersonMatchRow[]>();
  for (const person of people) {
    if (person.status !== "active") continue;
    const npn = normalizeNpn(person.npn);
    if (!npn) continue;
    const existing = byNpn.get(npn) ?? [];
    existing.push(person);
    byNpn.set(npn, existing);
  }
  return byNpn;
}

async function loadPeopleForMatching(supabase: SupabaseClient): Promise<PersonMatchRow[]> {
  const { data, error } = await supabase
    .from("person")
    .select("id, full_name, email, npn, npn_status, status")
    .not("npn", "is", null);
  if (error) throw new Error(error.message);
  return (data ?? []) as PersonMatchRow[];
}

async function createImportLog(
  supabase: SupabaseClient,
  parsed: GatewayIssuedPremiumParseResult,
  status: GatewayIssuedPremiumStatus,
  summary: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("gateway_issued_premium_import")
    .insert({
      period_type: parsed.periodType,
      status,
      report_date: parsed.reportDate,
      period_start: parsed.periodStart,
      gateway_label: parsed.gatewayLabel,
      source_file_name: parsed.sourceFileName,
      source_checksum: parsed.sourceChecksum,
      rows_seen: parsed.rows.length,
      skipped_count: status === "no_new_report" || status === "skipped" ? parsed.rows.length : 0,
      summary,
      finished_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string } | null)?.id ?? null;
}

export async function recordGatewayIssuedPremiumFailure(
  supabase: SupabaseClient,
  periodType: GatewayIssuedPremiumPeriod,
  error: unknown,
): Promise<GatewayIssuedPremiumImportResult> {
  const message = error instanceof Error ? error.message : String(error);
  const { data } = await supabase
    .from("gateway_issued_premium_import")
    .insert({
      period_type: periodType,
      status: "failed",
      summary: { error: message },
      error_message: message,
      finished_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  return {
    periodType,
    status: "failed",
    dryRun: false,
    importId: (data as { id: string } | null)?.id ?? null,
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
    message,
    samples: { unmatched: [], ambiguous: [], matched: [] },
  };
}

export async function runGatewayIssuedPremiumImport(
  supabase: SupabaseClient,
  opts: {
    periodType: GatewayIssuedPremiumPeriod;
    dryRun?: boolean;
    force?: boolean;
    csvText?: string;
    sourceFileName?: string | null;
    reportDate?: string | null;
    gatewayLabel?: string | null;
  },
): Promise<GatewayIssuedPremiumImportResult> {
  const dryRun = opts.dryRun === true;
  const force = opts.force === true;
  const fetched = opts.csvText
    ? { csvText: opts.csvText, sourceFileName: opts.sourceFileName ?? null }
    : await fetchConfiguredGatewayCsv(opts.periodType);

  const parsed = parseGatewayIssuedPremiumCsv(fetched.csvText, {
    periodType: opts.periodType,
    reportDate: opts.reportDate,
    sourceFileName: fetched.sourceFileName,
    gatewayLabel: opts.gatewayLabel,
  });

  const duplicateGatewayNpns = new Set<string>();
  const gatewayCounts = new Map<string, number>();
  for (const row of parsed.rows) {
    gatewayCounts.set(row.producerNpn, (gatewayCounts.get(row.producerNpn) ?? 0) + 1);
  }
  for (const [npn, count] of gatewayCounts) {
    if (count > 1) duplicateGatewayNpns.add(npn);
  }

  if (!dryRun && !force) {
    const { data: existing, error: existingErr } = await supabase
      .from("gateway_issued_premium_import")
      .select("id")
      .eq("period_type", parsed.periodType)
      .eq("report_date", parsed.reportDate)
      .eq("source_checksum", parsed.sourceChecksum)
      .eq("status", "imported")
      .limit(1)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);

    if (existing) {
      const importId = await createImportLog(supabase, parsed, "no_new_report", {
        reason: "same_report_checksum_already_imported",
        existingImportId: (existing as { id: string }).id,
      });
      return {
        periodType: parsed.periodType,
        status: "no_new_report",
        dryRun,
        importId,
        reportDate: parsed.reportDate,
        periodStart: parsed.periodStart,
        gatewayLabel: parsed.gatewayLabel,
        sourceFileName: parsed.sourceFileName,
        sourceChecksum: parsed.sourceChecksum,
        rowsSeen: parsed.rows.length,
        matchedCount: 0,
        unmatchedCount: 0,
        ambiguousCount: 0,
        skippedCount: parsed.rows.length,
        verifiedSubmittedCount: 0,
        message: "Same Gateway report was already imported.",
        samples: { unmatched: [], ambiguous: [], matched: [] },
      };
    }
  }

  const people = await loadPeopleForMatching(supabase);
  const peopleByNpn = buildPersonIndex(people);

  const matched: Array<{ row: ParsedGatewayIssuedPremiumRow; person: PersonMatchRow }> = [];
  const unmatched: Array<{ npn: string; producer: string }> = [];
  const ambiguous: Array<{ npn: string; producer: string; reason: string }> = [];

  for (const row of parsed.rows) {
    if (duplicateGatewayNpns.has(row.producerNpn)) {
      ambiguous.push({
        npn: row.producerNpn,
        producer: row.producer,
        reason: "duplicate_npn_in_gateway_report",
      });
      continue;
    }

    const candidates = peopleByNpn.get(row.producerNpn) ?? [];
    if (candidates.length === 1) {
      matched.push({ row, person: candidates[0] });
    } else if (candidates.length > 1) {
      ambiguous.push({
        npn: row.producerNpn,
        producer: row.producer,
        reason: "multiple_active_people_with_same_npn",
      });
    } else {
      unmatched.push({ npn: row.producerNpn, producer: row.producer });
    }
  }

  const samples = {
    unmatched: limited(unmatched),
    ambiguous: limited(ambiguous),
    matched: limited(
      matched.map((m) => ({
        npn: m.row.producerNpn,
        producer: m.row.producer,
        personId: m.person.id,
      })),
    ),
  };

  if (dryRun) {
    return {
      periodType: parsed.periodType,
      status: "skipped",
      dryRun,
      importId: null,
      reportDate: parsed.reportDate,
      periodStart: parsed.periodStart,
      gatewayLabel: parsed.gatewayLabel,
      sourceFileName: parsed.sourceFileName,
      sourceChecksum: parsed.sourceChecksum,
      rowsSeen: parsed.rows.length,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      ambiguousCount: ambiguous.length,
      skippedCount: parsed.rows.length - matched.length,
      verifiedSubmittedCount: matched.filter((m) => m.person.npn_status === "submitted").length,
      message: "Dry run only; no database rows were written.",
      samples,
    };
  }

  const { data: importLog, error: importErr } = await supabase
    .from("gateway_issued_premium_import")
    .insert({
      period_type: parsed.periodType,
      status: "pending",
      report_date: parsed.reportDate,
      period_start: parsed.periodStart,
      gateway_label: parsed.gatewayLabel,
      source_file_name: parsed.sourceFileName,
      source_checksum: parsed.sourceChecksum,
      rows_seen: parsed.rows.length,
      matched_count: matched.length,
      unmatched_count: unmatched.length,
      ambiguous_count: ambiguous.length,
      skipped_count: parsed.rows.length - matched.length,
      summary: { samples },
    })
    .select("id")
    .single();
  if (importErr) throw new Error(importErr.message);
  const importId = (importLog as { id: string }).id;

  try {
    if (matched.length) {
      const upsertRows = matched.map(({ row, person }) => ({
        person_id: person.id,
        import_id: importId,
        period_type: row.periodType,
        report_date: row.reportDate,
        period_start: row.periodStart,
        gateway_label: row.gatewayLabel,
        gateway_producer: row.producer,
        gateway_npn: row.producerNpn,
        gateway_email: row.email,
        gateway_upline: row.upline,
        gateway_upline_npn: row.uplineNpn,
        gateway_agency: row.agency,
        personal_ip_cents: row.personalIpCents,
        team_ip_cents: row.teamIpCents,
        first_leg_producer: row.firstLegProducer,
        first_leg_npn: row.firstLegNpn,
        first_leg_percent: row.firstLegPercent,
        outside_first_leg_cents: row.outsideFirstLegCents,
      }));

      const { error: upsertErr } = await supabase
        .from("producer_issued_premium")
        .upsert(upsertRows, {
          onConflict: "person_id,period_type,report_date",
        });
      if (upsertErr) throw new Error(upsertErr.message);

      const submittedIds = matched
        .filter((m) => m.person.npn_status === "submitted")
        .map((m) => m.person.id);
      if (submittedIds.length) {
        const { error: verifyErr } = await supabase
          .from("person")
          .update({
            npn_status: "verified",
            npn_source: "gateway_csv",
            npn_verified_at: new Date().toISOString(),
          })
          .in("id", submittedIds);
        if (verifyErr) throw new Error(verifyErr.message);
      }
    }

    const { error: finishErr } = await supabase
      .from("gateway_issued_premium_import")
      .update({
        status: "imported",
        finished_at: new Date().toISOString(),
      })
      .eq("id", importId);
    if (finishErr) throw new Error(finishErr.message);
  } catch (err) {
    await supabase
      .from("gateway_issued_premium_import")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
        finished_at: new Date().toISOString(),
      })
      .eq("id", importId);
    throw err;
  }

  return {
    periodType: parsed.periodType,
    status: "imported",
    dryRun,
    importId,
    reportDate: parsed.reportDate,
    periodStart: parsed.periodStart,
    gatewayLabel: parsed.gatewayLabel,
    sourceFileName: parsed.sourceFileName,
    sourceChecksum: parsed.sourceChecksum,
    rowsSeen: parsed.rows.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    ambiguousCount: ambiguous.length,
    skippedCount: parsed.rows.length - matched.length,
    verifiedSubmittedCount: matched.filter((m) => m.person.npn_status === "submitted").length,
    samples,
  };
}

export async function checkGatewayIssuedPremiumMonitor(
  supabase: SupabaseClient,
  opts?: { staleAfterHours?: number; pendingAfterMinutes?: number },
): Promise<GatewayIssuedPremiumMonitorResult> {
  const staleAfterHours = opts?.staleAfterHours ?? 30;
  const pendingAfterMinutes = opts?.pendingAfterMinutes ?? 30;
  const checkedAt = new Date();
  const staleCutoff = new Date(checkedAt.getTime() - staleAfterHours * 60 * 60 * 1000);
  const pendingCutoff = new Date(checkedAt.getTime() - pendingAfterMinutes * 60 * 1000);

  const { data: recentRows, error: recentErr } = await supabase
    .from("gateway_issued_premium_import")
    .select("id, period_type, status, report_date, started_at, finished_at, matched_count, unmatched_count, ambiguous_count, error_message")
    .gte("started_at", staleCutoff.toISOString())
    .order("started_at", { ascending: false })
    .limit(100);
  if (recentErr) throw new Error(recentErr.message);

  const rows = (recentRows ?? []) as Array<{
    id: string;
    period_type: string;
    status: string;
    report_date: string | null;
    started_at: string;
    finished_at: string | null;
    matched_count: number;
    unmatched_count: number;
    ambiguous_count: number;
    error_message: string | null;
  }>;

  const latestByPeriod: GatewayIssuedPremiumMonitorResult["latestByPeriod"] = {
    wtd: null,
    mtd: null,
    ytd: null,
  };
  for (const row of rows) {
    if (!isGatewayIssuedPremiumPeriod(row.period_type)) continue;
    if (!latestByPeriod[row.period_type]) {
      latestByPeriod[row.period_type] = {
        id: row.id,
        status: row.status,
        report_date: row.report_date,
        started_at: row.started_at,
        finished_at: row.finished_at,
        matched_count: row.matched_count,
        unmatched_count: row.unmatched_count,
        ambiguous_count: row.ambiguous_count,
      };
    }
  }

  const failedImports = rows
    .filter((row) => row.status === "failed")
    .map((row) => ({
      id: row.id,
      period_type: row.period_type,
      status: row.status,
      report_date: row.report_date,
      started_at: row.started_at,
      error_message: row.error_message,
    }));

  const stuckImports = rows
    .filter((row) => row.status === "pending" && row.started_at < pendingCutoff.toISOString())
    .map((row) => ({
      id: row.id,
      period_type: row.period_type,
      status: row.status,
      report_date: row.report_date,
      started_at: row.started_at,
    }));

  const stalePeriods = GATEWAY_ISSUED_PREMIUM_PERIODS.filter(
    (period) => latestByPeriod[period] === null,
  );

  return {
    ok: stalePeriods.length === 0 && failedImports.length === 0 && stuckImports.length === 0,
    checkedAt: checkedAt.toISOString(),
    staleAfterHours,
    pendingAfterMinutes,
    latestByPeriod,
    stalePeriods,
    failedImports,
    stuckImports,
  };
}
