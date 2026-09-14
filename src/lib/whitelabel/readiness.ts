import { SERVICE_CATALOG } from "./catalog";
import type {
  BuildReadiness,
  ReadinessIssue,
  WhitelabelBuild,
  WhitelabelBuildAddition,
  WhitelabelServiceConnection,
} from "./types";

function missing(key: string, label: string, section: ReadinessIssue["section"]): ReadinessIssue {
  return { key, label, section };
}

export function getBuildReadiness(
  build: WhitelabelBuild,
  services: WhitelabelServiceConnection[],
  additions: WhitelabelBuildAddition[],
): BuildReadiness {
  const issues: ReadinessIssue[] = [];

  if (!build.primary_contact_name.trim()) {
    issues.push(missing("primary_contact_name", "Primary contact name", "intake"));
  }
  if (!build.primary_contact_email.trim()) {
    issues.push(missing("primary_contact_email", "Primary contact email", "intake"));
  }
  if (!build.initial_admin_email.trim()) {
    issues.push(missing("initial_admin_email", "Initial admin email", "intake"));
  }
  if (!build.domain.trim()) {
    issues.push(missing("domain", "Customer domain", "intake"));
  }
  if (!build.brand_primary_color.trim()) {
    issues.push(missing("brand_primary_color", "Primary brand color", "intake"));
  }
  if (!build.brand_accent_color.trim()) {
    issues.push(missing("brand_accent_color", "Accent brand color", "intake"));
  }
  if (!build.logo_path) {
    issues.push(missing("logo_path", "Brand logo", "intake"));
  }
  if (!build.favicon_path) {
    issues.push(missing("favicon_path", "Favicon", "intake"));
  }
  if (!build.standard_scope_confirmed) {
    issues.push(missing("standard_scope_confirmed", "Standard scope confirmation", "scope"));
  }
  if (build.payment_status !== "paid") {
    issues.push(missing("payment_status", "Upfront payment", "payment"));
  }

  const buildServices = services.filter((service) => service.build_id === build.id);
  for (const service of buildServices) {
    const catalog = SERVICE_CATALOG[service.service_kind];
    const effectivelyRequired = catalog.defaultRequired || service.required;
    if (!effectivelyRequired) continue;
    if (!service.provider_name.trim()) {
      issues.push({
        key: `service:${service.service_kind}:provider`,
        label: `${catalog.label} — provider is not identified`,
        section: "access",
        serviceKind: service.service_kind,
      });
    }
    if (service.status !== "verified") {
      const suffix =
        service.status === "needs_owner_action"
          ? " — account owner action needed"
          : service.status === "failed"
            ? " — connection failed"
            : " — access not verified";
      issues.push({
        key: `service:${service.service_kind}`,
        label: `${catalog.label}${suffix}`,
        section: "access",
        serviceKind: service.service_kind,
      });
      continue;
    }

    const missingVerifiedReference =
      !service.account_ref?.trim() ||
      ((service.service_kind === "vercel" || service.service_kind === "supabase") &&
        (!service.project_ref?.trim() ||
          service.verification_method !== "provider_api" ||
          !service.credential_secret_id ||
          !service.last_checked_at));
    if (missingVerifiedReference) {
      issues.push({
        key: `service:${service.service_kind}:verification-evidence`,
        label: `${catalog.label} — verified access is missing its account/project evidence`,
        section: "access",
        serviceKind: service.service_kind,
      });
    }
  }

  // Defensive: a malformed/partial seed must not make a build look ready.
  for (const [kind, catalog] of Object.entries(SERVICE_CATALOG)) {
    if (!catalog.defaultRequired) continue;
    if (!buildServices.some((service) => service.service_kind === kind)) {
      issues.push({
        key: `service:${kind}`,
        label: `${catalog.label} — service record missing`,
        section: "access",
        serviceKind: kind as keyof typeof SERVICE_CATALOG,
      });
    }
  }

  for (const addition of additions.filter((item) => item.build_id === build.id)) {
    if (!addition.delivery_requirements.trim()) {
      issues.push(
        missing(
          `addition:${addition.id}:requirements`,
          `${addition.name} — delivery requirements`,
          "scope",
        ),
      );
    }
  }

  return { ready: issues.length === 0, missing: issues };
}
