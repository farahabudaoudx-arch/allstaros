import type {
  MaintenanceStatus,
  ServiceKind,
  WhitelabelBuildAddition,
  WhitelabelServiceConnection,
} from "./types";
import { isWhitelabelLocalPilot, localPilotRuntimeUrlForCanonical } from "@/lib/local-pilot";

export const CURRENT_CUSTOMER_SCHEMA_RELEASE = "20260914004000_whitelabel_content_services";

export const VERIFICATION_STATUSES = ["pending", "passed", "failed", "deferred", "not_applicable"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type VerificationCategory =
  | "access"
  | "auth"
  | "branding"
  | "business_flow"
  | "integration"
  | "scope"
  | "support"
  | "operations";

export type VerificationSeedItem = {
  checkKey: string;
  label: string;
  category: VerificationCategory;
  mode: "automated" | "manual";
  sourceKind: "base" | "addition";
  additionId?: string;
  requiredForHandoff: boolean;
  status: VerificationStatus;
  expectedSummary: string;
  actualSummary?: string;
  evidence?: Record<string, unknown>;
};

export type LiveVersionEvidence = {
  ok: boolean;
  summary: string;
  evidence: { osUrl: string; expectedSha: string; actualSha: string | null; expectedSchema: string; actualSchema: string | null };
};

const MANUAL_BASE_CHECKS: Array<Pick<VerificationSeedItem, "checkKey" | "label" | "category" | "expectedSummary">> = [
  { checkKey: "admin-auth", label: "Initial admin invite, sign-in, and password reset", category: "auth", expectedSummary: "Customer admin can activate access, sign in, and complete password reset." },
  { checkKey: "recruiting", label: "Recruiting workflow", category: "business_flow", expectedSummary: "Recruit entry and recruiting workflow complete successfully in the customer installation." },
  { checkKey: "downline", label: "Downline workflow", category: "business_flow", expectedSummary: "Downline hierarchy loads and customer-scoped navigation works." },
  { checkKey: "client-entry", label: "Client entry", category: "business_flow", expectedSummary: "A customer user can create and reopen a client record without cross-install data." },
  { checkKey: "sales-reporting", label: "Sales tracking and reporting", category: "business_flow", expectedSummary: "Sales tracking and reporting work with customer-local data." },
  { checkKey: "upload-isolation", label: "Upload isolation", category: "operations", expectedSummary: "A customer upload is stored only in the customer-owned project/bucket and is not visible from another installation." },
  { checkKey: "email-identity", label: "Email identity and destination", category: "integration", expectedSummary: "A live test email uses the customer sender/reply-to configuration and reaches the intended destination." },
  { checkKey: "report-bug", label: "Report-a-Bug routing", category: "support", expectedSummary: "A test bug report reaches the installation support inbox with the reporter as reply-to." },
  { checkKey: "cron-auth", label: "Scheduled-job authorization", category: "operations", expectedSummary: "Missing or invalid Bearer auth is rejected and an authorized invocation succeeds without exposing the cron secret." },
  { checkKey: "branding", label: "Branding surfaces", category: "branding", expectedSummary: "Sign-in, portal, admin, email, favicon, and primary customer surfaces show the installation brand without customer-facing All Star fallback." },
];

function requiredServiceEvidence(services: WhitelabelServiceConnection[]): {
  ok: boolean;
  checked: ServiceKind[];
} {
  const checked: ServiceKind[] = [];
  let ok = true;
  for (const service of services) {
    if (!service.required && service.status === "not_required") continue;
    if (service.required || ["vercel", "supabase", "email", "ai"].includes(service.service_kind)) {
      checked.push(service.service_kind);
      if (
        service.status !== "verified"
        || !service.account_ref
        || !service.credential_secret_id
        || service.verification_method !== "provider_api"
        || !service.last_checked_at
      ) {
        ok = false;
      }
    }
  }
  return { ok, checked };
}

export async function verifyLiveInstallationVersion(args: {
  osUrl: string;
  expectedSha: string;
  expectedSchema: string;
  fetcher?: typeof fetch;
}): Promise<LiveVersionEvidence> {
  const fetcher = args.fetcher ?? fetch;
  const osUrl = args.osUrl.replace(/\/+$/, "");
  const runtimeUrl = isWhitelabelLocalPilot()
    ? await localPilotRuntimeUrlForCanonical(osUrl)
    : osUrl;
  const evidence: LiveVersionEvidence["evidence"] = {
    osUrl,
    expectedSha: args.expectedSha,
    actualSha: null,
    expectedSchema: args.expectedSchema,
    actualSchema: null,
  };
  try {
    const response = await fetcher(`${runtimeUrl}/api/version`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { ok: false, summary: `Live version endpoint returned HTTP ${response.status}.`, evidence };
    const body = await response.json() as { sha?: unknown; schemaRelease?: unknown };
    evidence.actualSha = typeof body.sha === "string" ? body.sha : null;
    evidence.actualSchema = typeof body.schemaRelease === "string" ? body.schemaRelease : null;
    const ok = evidence.actualSha === args.expectedSha && evidence.actualSchema === args.expectedSchema;
    return {
      ok,
      summary: ok
        ? `Live customer URL reports source ${args.expectedSha} and schema ${args.expectedSchema}.`
        : `Live version mismatch: source=${evidence.actualSha ?? "missing"}, schema=${evidence.actualSchema ?? "missing"}.`,
      evidence,
    };
  } catch {
    return { ok: false, summary: "Live customer version endpoint could not be reached.", evidence };
  }
}

export function buildHandoffVerificationItems(args: {
  additions: WhitelabelBuildAddition[];
  services: WhitelabelServiceConnection[];
  maintenanceStatus: MaintenanceStatus;
  sourceSha: string;
  deploymentUrl: string;
  liveVersion: LiveVersionEvidence;
}): VerificationSeedItem[] {
  const providerEvidence = requiredServiceEvidence(args.services);
  const items: VerificationSeedItem[] = [
    {
      checkKey: "deployed-source",
      label: "Installed source and deployment",
      category: "operations",
      mode: "automated",
      sourceKind: "base",
      requiredForHandoff: true,
      status: args.sourceSha && args.deploymentUrl.startsWith("https://") ? "passed" : "failed",
      expectedSummary: "The handoff run is tied to a succeeded provisioning run and exact deployed Git SHA.",
      actualSummary: args.sourceSha ? `${args.sourceSha} at ${args.deploymentUrl}` : "No verified deployed source was found.",
      evidence: { sourceSha: args.sourceSha, deploymentUrl: args.deploymentUrl },
    },
    {
      checkKey: "live-version",
      label: "Live customer source and schema",
      category: "operations",
      mode: "automated",
      sourceKind: "base",
      requiredForHandoff: true,
      status: args.liveVersion.ok ? "passed" : "failed",
      expectedSummary: "The customer-facing OS URL reports the exact approved source SHA and customer schema release.",
      actualSummary: args.liveVersion.summary,
      evidence: args.liveVersion.evidence,
    },
    {
      checkKey: "provider-access",
      label: "Required provider access",
      category: "access",
      mode: "automated",
      sourceKind: "base",
      requiredForHandoff: true,
      status: providerEvidence.ok ? "passed" : "failed",
      expectedSummary: "Required provider connections have current provider-API evidence and secure credential references.",
      actualSummary: providerEvidence.ok ? "Provider evidence is complete." : "One or more required provider checks are incomplete.",
      evidence: { checkedServiceKinds: providerEvidence.checked },
    },
    ...MANUAL_BASE_CHECKS.map((check) => ({
      ...check,
      mode: "manual" as const,
      sourceKind: "base" as const,
      requiredForHandoff: true,
      status: "pending" as const,
    })),
  ];

  if (args.maintenanceStatus === "selected") {
    items.push({
      checkKey: "maintenance-onboarding",
      label: "Maintenance onboarding / shared webinar privacy",
      category: "support",
      mode: "manual",
      sourceKind: "base",
      requiredForHandoff: true,
      status: "pending",
      expectedSummary: "Selected maintenance onboarding is completed without exposing another customer's environment or data.",
    });
  } else {
    items.push({
      checkKey: "maintenance-onboarding",
      label: "Maintenance onboarding / shared webinar privacy",
      category: "support",
      mode: "manual",
      sourceKind: "base",
      requiredForHandoff: false,
      status: "not_applicable",
      expectedSummary: "Not required because maintenance was not selected.",
      actualSummary: "Maintenance not selected.",
    });
  }

  for (const addition of args.additions) {
    const launch = addition.delivery_phase === "launch";
    items.push({
      checkKey: `addition:${addition.id}`,
      label: `Purchased addition — ${addition.name}`,
      category: "scope",
      mode: "manual",
      sourceKind: "addition",
      additionId: addition.id,
      requiredForHandoff: launch,
      status: launch ? "pending" : "deferred",
      expectedSummary: launch
        ? addition.delivery_requirements || "Verify the agreed launch delivery requirements."
        : `Agreed for post-handoff delivery. ${addition.delivery_requirements}`.trim(),
      actualSummary: launch ? undefined : "Explicitly deferred to the post-handoff delivery phase.",
      evidence: { deliveryPhase: addition.delivery_phase },
    });
  }

  return items;
}

export function verificationCanPass(items: Array<Pick<VerificationSeedItem, "requiredForHandoff" | "status">>): boolean {
  return items.every((item) => !item.requiredForHandoff || item.status === "passed");
}

export function addBusinessDays(start: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0) throw new Error("Business-day count must be a non-negative integer.");
  const result = new Date(start.getTime());
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return result;
}
