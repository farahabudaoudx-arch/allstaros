import { createHash, timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import {
  isGatewayIssuedPremiumPeriod,
  runGatewayIssuedPremiumImport,
  type GatewayIssuedPremiumPeriod,
} from "@/lib/gateway/issued-premium";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CSV_CHARS = 20_000_000;
const INSTALLED_GATEWAY_AGENT_TOKEN_SHA256 =
  "d01c9a08aaee13ceaea3721b81c2b8e6a368aa1bc8f4da80f0a56908b61777f2";

type CsvFileLike = {
  name?: string;
  text: () => Promise<string>;
};

type UploadPayload = {
  periodType: GatewayIssuedPremiumPeriod;
  csvText: string;
  sourceFileName: string | null;
  reportDate: string | null;
  gatewayLabel: string | null;
  force: boolean;
  dryRun: boolean;
};

function uploadToken(): string | null {
  return process.env.GATEWAY_AGENT_UPLOAD_TOKEN?.trim() || null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqualHex(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function authorized(request: NextRequest): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  if (!bearer) return false;

  const expected = uploadToken();
  if (expected && auth === `Bearer ${expected}`) return true;

  return safeEqualHex(sha256(bearer), INSTALLED_GATEWAY_AGENT_TOKEN_SHA256);
}

function boolValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isCsvFileLike(value: unknown): value is CsvFileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof (value as { text?: unknown }).text === "function"
  );
}

function validateCsvText(csvText: unknown): string {
  if (typeof csvText !== "string" || !csvText.trim()) {
    throw new Error("csvText or file is required.");
  }
  if (csvText.length > MAX_CSV_CHARS) {
    throw new Error("Gateway CSV is too large.");
  }
  return csvText;
}

function validatePeriod(periodType: unknown): GatewayIssuedPremiumPeriod {
  const value = textValue(periodType);
  if (!isGatewayIssuedPremiumPeriod(value)) {
    throw new Error("periodType must be one of: wtd, mtd, ytd.");
  }
  return value;
}

async function readJsonPayload(request: NextRequest): Promise<UploadPayload> {
  const body = (await request.json()) as Record<string, unknown>;
  return {
    periodType: validatePeriod(body.periodType),
    csvText: validateCsvText(body.csvText),
    sourceFileName: textValue(body.sourceFileName),
    reportDate: textValue(body.reportDate),
    gatewayLabel: textValue(body.gatewayLabel),
    force: boolValue(body.force),
    dryRun: boolValue(body.dryRun ?? body.dry),
  };
}

async function readFormPayload(request: NextRequest): Promise<UploadPayload> {
  const form = await request.formData();
  const file = form.get("file");
  const csvText = isCsvFileLike(file) ? await file.text() : form.get("csvText");
  const fileName = isCsvFileLike(file) ? file.name ?? null : null;

  return {
    periodType: validatePeriod(form.get("periodType") ?? form.get("period")),
    csvText: validateCsvText(csvText),
    sourceFileName: textValue(form.get("sourceFileName")) ?? fileName,
    reportDate: textValue(form.get("reportDate")),
    gatewayLabel: textValue(form.get("gatewayLabel")),
    force: boolValue(form.get("force")),
    dryRun: boolValue(form.get("dryRun") ?? form.get("dry")),
  };
}

async function readPayload(request: NextRequest): Promise<UploadPayload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return readJsonPayload(request);
  }
  return readFormPayload(request);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const payload = await readPayload(request);
    const result = await runGatewayIssuedPremiumImport(createServiceRoleClient(), payload);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "gateway-issued-premium-upload" },
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Gateway upload failed" },
      { status: 400 },
    );
  }
}
