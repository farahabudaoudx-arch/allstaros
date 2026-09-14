export const PROVISIONING_STEPS = [
  "validate_intake",
  "verify_provider_access",
  "apply_clean_schema",
  "configure_installation",
  "configure_vercel_environment",
  "deploy_source",
  "configure_domain",
  "create_initial_admin",
  "smoke_check",
] as const;

export type ProvisioningStepKey = (typeof PROVISIONING_STEPS)[number];
export type ProvisioningStepStatus = "pending" | "running" | "blocked" | "failed" | "succeeded" | "skipped";
export type ProvisioningRunStatus = "pending" | "running" | "blocked" | "failed" | "succeeded" | "cancelled";

export const PROVISIONING_STEP_LABELS: Record<ProvisioningStepKey, string> = {
  validate_intake: "Validate intake",
  verify_provider_access: "Re-check provider access",
  apply_clean_schema: "Apply clean customer schema",
  configure_installation: "Apply installation settings",
  configure_vercel_environment: "Configure Vercel environment",
  deploy_source: "Deploy source version",
  configure_domain: "Attach customer domain",
  create_initial_admin: "Create initial customer admin",
  smoke_check: "Run deployment smoke check",
};

export const BLOCKING_STEP_STATUSES = new Set<ProvisioningStepStatus>(["blocked", "failed"]);

export function nextProvisioningStep(
  steps: Array<{ step_key: ProvisioningStepKey; status: ProvisioningStepStatus; ordinal: number }>,
): ProvisioningStepKey | null {
  const ordered = [...steps].sort((a, b) => a.ordinal - b.ordinal);
  const next = ordered.find((step) => step.status !== "succeeded" && step.status !== "skipped");
  return next?.step_key ?? null;
}

export function seedProvisioningSteps() {
  return PROVISIONING_STEPS.map((step_key, index) => ({ step_key, ordinal: index + 1 }));
}
