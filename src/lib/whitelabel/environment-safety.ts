export type WhitelabelLocalProjectRole = "control-plane-local" | "customer-local";

export type WhitelabelProvider = "supabase" | "vercel";

type EnvLike = Record<string, string | undefined>;

const PROTECTED_REF_KEYS: Record<WhitelabelProvider, readonly string[]> = {
  supabase: [
    "WHITELABEL_DEV_PREVIEW_SUPABASE_PROJECT_REF",
    "WHITELABEL_PRODUCTION_SUPABASE_PROJECT_REF",
  ],
  vercel: [
    "WHITELABEL_DEV_PREVIEW_VERCEL_PROJECT_REF",
    "WHITELABEL_PRODUCTION_VERCEL_PROJECT_REF",
  ],
};

function normalized(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function assertLocalWhitelabelMutationTarget(params: {
  projectRef: string;
  role: WhitelabelLocalProjectRole;
  operation: string;
  expectedRole?: WhitelabelLocalProjectRole;
}): void {
  if (params.role !== "control-plane-local" && params.role !== "customer-local") {
    throw new Error(`Blocked ${params.operation}: ${params.projectRef} is not an approved local Whitelabel target.`);
  }
  if (params.expectedRole && params.role !== params.expectedRole) {
    throw new Error(
      `Blocked ${params.operation}: ${params.projectRef} has role ${params.role}, expected ${params.expectedRole}.`,
    );
  }
}

export function assertRemoteWhitelabelMutationAllowed(params: {
  provider: WhitelabelProvider;
  projectRef: string;
  operation: string;
  env?: EnvLike;
}): void {
  const env = params.env ?? process.env;
  if (normalized(env.WHITELABEL_LOCAL_ONLY) === "1") {
    throw new Error(`Blocked ${params.operation}: remote ${params.provider} mutations are disabled by WHITELABEL_LOCAL_ONLY=1.`);
  }

  const projectRef = normalized(params.projectRef);
  for (const key of PROTECTED_REF_KEYS[params.provider]) {
    const protectedRef = normalized(env[key]);
    if (protectedRef && protectedRef === projectRef) {
      throw new Error(`Blocked ${params.operation}: ${params.provider} project ${projectRef} is protected by ${key}.`);
    }
  }
}
