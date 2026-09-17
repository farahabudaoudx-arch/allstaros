import "server-only";

import { isWhitelabelLocalPilot, localPilotProject } from "@/lib/local-pilot";

type FetchLike = typeof fetch;

export type ProviderVerificationResult =
  | {
      ok: true;
      providerName: "Vercel" | "Supabase";
      accountRef: string;
      accountLabel: string | null;
      projectRef: string;
      projectName: string | null;
      billingUrl: string;
    }
  | { ok: false; error: string };

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringField(value: JsonRecord | null, key: string): string | null {
  const field = value?.[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

async function safeJson(response: Response): Promise<JsonRecord | null> {
  try {
    return record(await response.json());
  } catch {
    return null;
  }
}

function providerFailure(provider: "Vercel" | "Supabase", status?: number): ProviderVerificationResult {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      error: `${provider} access was denied. Confirm the account owner supplied a token with read access to this project, then retry.`,
    };
  }
  if (status === 404) {
    return {
      ok: false,
      error: `${provider} could not find that project in the supplied customer account. Confirm the account/project references, then retry.`,
    };
  }
  return {
    ok: false,
    error: `${provider} access could not be verified. Retry the check after confirming the provider is available and the customer access is still valid.`,
  };
}

export async function verifyVercelProjectAccess(
  params: {
    accessToken: string;
    accountRef: string;
    projectRef: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<ProviderVerificationResult> {
  if (isWhitelabelLocalPilot()) {
    try {
      const project = await localPilotProject(params.projectRef);
      if (project.accountRef !== params.accountRef) {
        return {
          ok: false,
          error: "Vercel local-pilot project belongs to a different configured account reference.",
        };
      }
      return {
        ok: true,
        providerName: "Vercel",
        accountRef: project.accountRef,
        accountLabel: "Local Pilot",
        projectRef: project.projectRef,
        projectName: project.projectRef,
        billingUrl: "https://vercel.com/~/usage",
      };
    } catch {
      return {
        ok: false,
        error: "Vercel local-pilot project is not registered for this rehearsal.",
      };
    }
  }

  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(params.projectRef)}`);
  url.searchParams.set("teamId", params.accountRef);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${params.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return providerFailure("Vercel", response.status);

    const body = await safeJson(response);
    const projectId = stringField(body, "id");
    const projectName = stringField(body, "name");
    const accountId = stringField(body, "accountId");
    if (!projectId) return providerFailure("Vercel");
    if (accountId && accountId !== params.accountRef) {
      return {
        ok: false,
        error: "Vercel returned a project owned by a different account than the build record. Confirm the customer team/account reference before continuing.",
      };
    }

    const resolvedAccountId = accountId ?? params.accountRef;
    const teamResponse = await fetchImpl(
      `https://api.vercel.com/v2/teams/${encodeURIComponent(resolvedAccountId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${params.accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!teamResponse.ok) return providerFailure("Vercel", teamResponse.status);
    const team = await safeJson(teamResponse);
    const teamId = stringField(team, "id");
    const teamSlug = stringField(team, "slug");
    const teamName = stringField(team, "name");
    if (teamId !== resolvedAccountId || !teamSlug) return providerFailure("Vercel");

    return {
      ok: true,
      providerName: "Vercel",
      accountRef: resolvedAccountId,
      accountLabel: teamName ?? teamSlug,
      projectRef: projectId,
      projectName,
      billingUrl: `https://vercel.com/${encodeURIComponent(teamSlug)}/~/usage`,
    };
  } catch {
    return providerFailure("Vercel");
  }
}

export async function verifySupabaseProjectAccess(
  params: {
    accessToken: string;
    accountRef: string | null;
    projectRef: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<ProviderVerificationResult> {
  if (isWhitelabelLocalPilot()) {
    try {
      const project = await localPilotProject(params.projectRef);
      if (params.accountRef && params.accountRef !== project.accountRef) {
        return {
          ok: false,
          error: "Supabase local-pilot project belongs to a different configured account reference.",
        };
      }
      return {
        ok: true,
        providerName: "Supabase",
        accountRef: project.accountRef,
        accountLabel: "Local Pilot",
        projectRef: project.projectRef,
        projectName: project.projectRef,
        billingUrl: `https://supabase.com/dashboard/org/${encodeURIComponent(project.accountRef)}/usage`,
      };
    } catch {
      return {
        ok: false,
        error: "Supabase local-pilot project is not registered for this rehearsal.",
      };
    }
  }

  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(params.projectRef)}`;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${params.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return providerFailure("Supabase", response.status);

    const body = await safeJson(response);
    const projectRef = stringField(body, "ref") ?? stringField(body, "id");
    const projectName = stringField(body, "name");
    const organizationId = stringField(body, "organization_id");
    const organizationSlug = stringField(body, "organization_slug");
    const actualAccountRef = organizationSlug ?? organizationId;
    if (!projectRef || !actualAccountRef || !organizationSlug) return providerFailure("Supabase");

    if (
      params.accountRef &&
      params.accountRef !== organizationId &&
      params.accountRef !== organizationSlug
    ) {
      return {
        ok: false,
        error: "Supabase returned a project owned by a different organization than the build record. Confirm the customer organization reference before continuing.",
      };
    }

    return {
      ok: true,
      providerName: "Supabase",
      accountRef: actualAccountRef,
      accountLabel: organizationSlug,
      projectRef,
      projectName,
      billingUrl: `https://supabase.com/dashboard/org/${encodeURIComponent(organizationSlug)}/usage`,
    };
  } catch {
    return providerFailure("Supabase");
  }
}
