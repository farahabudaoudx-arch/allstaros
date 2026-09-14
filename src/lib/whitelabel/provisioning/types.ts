import type { ProvisioningRunStatus, ProvisioningStepKey, ProvisioningStepStatus } from "./plan";

export type WhitelabelProvisioningRun = {
  id: string;
  build_id: string;
  source_sha: string;
  status: ProvisioningRunStatus;
  current_step: ProvisioningStepKey | null;
  deployment_ref: string | null;
  deployment_url: string | null;
  last_error: string | null;
  started_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WhitelabelProvisioningStep = {
  id: string;
  run_id: string;
  build_id: string;
  step_key: ProvisioningStepKey;
  ordinal: number;
  status: ProvisioningStepStatus;
  attempt_count: number;
  request_key: string;
  external_ref: string | null;
  external_url: string | null;
  safe_result: Record<string, unknown>;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProvisioningState = {
  run: WhitelabelProvisioningRun;
  steps: WhitelabelProvisioningStep[];
};

export type StepExecutionResult = {
  externalRef?: string | null;
  externalUrl?: string | null;
  safeResult?: Record<string, unknown>;
};

export type StepExecutionOutcome = StepExecutionResult & {
  kind: "succeeded" | "waiting" | "blocked";
  message?: string;
};

export class ProvisioningBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisioningBlockedError";
  }
}
