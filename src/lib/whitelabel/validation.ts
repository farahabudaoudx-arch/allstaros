import {
  ADDITION_STATUSES,
  ADDITION_TYPES,
  MAINTENANCE_STATUSES,
  PAYMENT_STATUSES,
  SERVICE_KINDS,
  SERVICE_STATUSES,
  type AdditionStatus,
  type AdditionType,
  type MaintenanceStatus,
  type PaymentStatus,
  type ServiceKind,
  type ServiceStatus,
} from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:api[_ -]?key|secret|token|password)\s*[:=]\s*\S{8,}/i,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,}/i,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/i,
  /\bsbp_[A-Za-z0-9_-]{16,}\b/i,
  /\b(?:ghp|github_pat|xox[baprs]|sb_secret)_[A-Za-z0-9_-]{8,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
];

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function requiredText(value: FormDataEntryValue | null, label: string, max = 160): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > max) throw new Error(`${label} is too long.`);
  return text;
}

export function optionalText(value: FormDataEntryValue | null, max = 2000): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > max) throw new Error("A field is too long.");
  return text;
}

export function emailValue(
  value: FormDataEntryValue | null,
  label: string,
  required = true,
): string | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  if (text.length > 254 || !EMAIL_RE.test(text)) throw new Error(`${label} is not a valid email.`);
  return text;
}

export function normalizeDomain(value: FormDataEntryValue | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!url.hostname || (url.pathname !== "/" && url.pathname !== "")) {
      throw new Error("bad domain");
    }
    return url.hostname.toLowerCase();
  } catch {
    throw new Error("Domain must be a hostname such as agency.example.com.");
  }
}

export function timezoneValue(value: FormDataEntryValue | null): string {
  const timezone = String(value ?? "").trim() || "America/Chicago";
  if (timezone.length > 80) throw new Error("Timezone is too long.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error("Timezone must be a valid IANA timezone.");
  }
  return timezone;
}

export function colorValue(value: FormDataEntryValue | null, label: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (!HEX_COLOR_RE.test(raw)) {
    throw new Error(label + " must be a 6-digit hex color such as #0F172A.");
  }
  return raw.toUpperCase();
}

export function httpsUrlValue(value: FormDataEntryValue | null, label: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > 1000) throw new Error(`${label} is too long.`);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      throw new Error("unsafe url");
    }
    return url.toString();
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL without embedded credentials.`);
  }
}

export function providerBillingUrlValue(
  value: FormDataEntryValue | null,
  label: string,
  serviceKind: ServiceKind,
): string | null {
  const normalized = httpsUrlValue(value, label);
  if (!normalized) return null;
  const host = new URL(normalized).hostname.toLowerCase();
  if (serviceKind === "vercel" && host !== "vercel.com" && host !== "www.vercel.com") {
    throw new Error("Vercel billing/usage links must point to vercel.com.");
  }
  if (serviceKind === "supabase" && host !== "supabase.com" && host !== "www.supabase.com") {
    throw new Error("Supabase billing/usage links must point to supabase.com.");
  }
  return normalized;
}

export function assertNoSecretLikeValue(value: string | null, label: string): void {
  if (!value) return;
  if (SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new Error(`${label} looks like a credential or token. Store credentials in secure provider configuration, not the setup record.`);
  }
}

export function safeReference(value: FormDataEntryValue | null, label: string): string | null {
  const text = optionalText(value, 300);
  assertNoSecretLikeValue(text, label);
  return text;
}

function enumValue<T extends readonly string[]>(
  value: FormDataEntryValue | null,
  allowed: T,
  label: string,
): T[number] {
  const text = String(value ?? "");
  if (!allowed.includes(text)) throw new Error(`${label} is invalid.`);
  return text as T[number];
}

export function paymentStatusValue(value: FormDataEntryValue | null): PaymentStatus {
  return enumValue(value, PAYMENT_STATUSES, "Payment status");
}

export function maintenanceStatusValue(value: FormDataEntryValue | null): MaintenanceStatus {
  return enumValue(value, MAINTENANCE_STATUSES, "Maintenance status");
}

export function serviceKindValue(value: FormDataEntryValue | null): ServiceKind {
  return enumValue(value, SERVICE_KINDS, "Service");
}

export function serviceStatusValue(value: FormDataEntryValue | null): ServiceStatus {
  return enumValue(value, SERVICE_STATUSES, "Service status");
}

export function additionTypeValue(value: FormDataEntryValue | null): AdditionType {
  return enumValue(value, ADDITION_TYPES, "Addition type");
}

export function additionStatusValue(value: FormDataEntryValue | null): AdditionStatus {
  return enumValue(value, ADDITION_STATUSES, "Addition status");
}
