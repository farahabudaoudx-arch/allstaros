import "server-only";

import {
  isWhitelabelLocalPilot,
  localPilotCanonicalAppUrl,
  localPilotProject,
  patchLocalPilotDeploymentState,
  readLocalPilotDeploymentState,
} from "@/lib/local-pilot";
import {
  assertLocalWhitelabelMutationTarget,
  assertRemoteWhitelabelMutationAllowed,
} from "@/lib/whitelabel/environment-safety";

const API = "https://api.vercel.com";

function teamQuery(teamId: string): string {
  return `?teamId=${encodeURIComponent(teamId)}`;
}

async function request(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
}

async function apiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message || `Vercel returned HTTP ${response.status}.`;
  } catch {
    return `Vercel returned HTTP ${response.status}.`;
  }
}

export async function upsertVercelEnvironment(params: {
  token: string;
  teamId: string;
  projectRef: string;
  values: Array<{ key: string; value: string; sensitive?: boolean }>;
}) {
  if (isWhitelabelLocalPilot()) {
    const project = await localPilotProject(params.projectRef);
    assertLocalWhitelabelMutationTarget({
      projectRef: params.projectRef,
      role: project.role,
      operation: "Vercel environment mutation",
      expectedRole: "customer-local",
    });
    await patchLocalPilotDeploymentState(params.projectRef, {
      environment: Object.fromEntries(params.values.map((item) => [item.key, item.value])),
    });
    return;
  }
  assertRemoteWhitelabelMutationAllowed({
    provider: "vercel",
    projectRef: params.projectRef,
    operation: "Vercel environment mutation",
  });
  const response = await request(
    params.token,
    `/v10/projects/${encodeURIComponent(params.projectRef)}/env${teamQuery(params.teamId)}&upsert=true`,
    {
      method: "POST",
      body: JSON.stringify(
        params.values.map((item) => ({
          key: item.key,
          value: item.value,
          type: item.sensitive ? "sensitive" : "encrypted",
          target: item.sensitive ? ["production", "preview"] : ["production", "preview", "development"],
        })),
      ),
    },
  );
  if (!response.ok) throw new Error(await apiError(response));
}

export async function createVercelGitDeployment(params: {
  token: string;
  teamId: string;
  projectRef: string;
  projectName: string;
  repoId: string;
  sourceSha: string;
}) {
  if (isWhitelabelLocalPilot()) {
    const project = await localPilotProject(params.projectRef);
    assertLocalWhitelabelMutationTarget({
      projectRef: params.projectRef,
      role: project.role,
      operation: "Vercel deployment",
      expectedRole: "customer-local",
    });
    const canonical = await localPilotCanonicalAppUrl(params.projectRef);
    if (!canonical) throw new Error(`Local pilot Vercel project ${params.projectRef} has no canonicalAppUrl.`);
    const deploymentRef = `local:${params.projectRef}:${params.sourceSha.slice(0, 12)}`;
    await patchLocalPilotDeploymentState(params.projectRef, {
      sourceSha: params.sourceSha,
      deploymentRef,
      deploymentUrl: canonical,
    });
    return { id: deploymentRef, url: canonical, readyState: "READY" };
  }
  assertRemoteWhitelabelMutationAllowed({
    provider: "vercel",
    projectRef: params.projectRef,
    operation: "Vercel deployment",
  });
  const response = await request(params.token, `/v13/deployments${teamQuery(params.teamId)}`, {
    method: "POST",
    body: JSON.stringify({
      name: params.projectName,
      project: params.projectRef,
      target: "production",
      gitSource: { type: "github", repoId: params.repoId, sha: params.sourceSha },
    }),
  });
  if (!response.ok) throw new Error(await apiError(response));
  const body = (await response.json()) as { id?: string; url?: string; readyState?: string };
  if (!body.id || !body.url) throw new Error("Vercel deployment did not return an id and URL.");
  return { id: body.id, url: body.url.startsWith("http") ? body.url : `https://${body.url}`, readyState: body.readyState ?? null };
}

export async function getVercelDeployment(params: { token: string; teamId: string; deploymentRef: string }) {
  if (isWhitelabelLocalPilot()) {
    const match = params.deploymentRef.match(/^local:([^:]+):[0-9a-f]+$/i);
    if (!match) return { id: params.deploymentRef, url: null, readyState: "ERROR" };
    const state = await readLocalPilotDeploymentState(match[1]);
    return {
      id: state.deploymentRef ?? params.deploymentRef,
      url: state.deploymentUrl,
      readyState: state.deploymentRef === params.deploymentRef ? "READY" : "ERROR",
    };
  }
  const response = await request(
    params.token,
    `/v13/deployments/${encodeURIComponent(params.deploymentRef)}${teamQuery(params.teamId)}`,
  );
  if (!response.ok) throw new Error(await apiError(response));
  const body = (await response.json()) as { id?: string; url?: string; readyState?: string; state?: string };
  return { id: body.id ?? params.deploymentRef, url: body.url ?? null, readyState: body.readyState ?? body.state ?? null };
}

export async function ensureVercelProjectDomain(params: {
  token: string;
  teamId: string;
  projectRef: string;
  domain: string;
}) {
  if (isWhitelabelLocalPilot()) {
    const project = await localPilotProject(params.projectRef);
    assertLocalWhitelabelMutationTarget({
      projectRef: params.projectRef,
      role: project.role,
      operation: "Vercel domain mutation",
      expectedRole: "customer-local",
    });
    const canonical = await localPilotCanonicalAppUrl(params.projectRef);
    const expected = `https://${params.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
    return {
      name: params.domain,
      verified: canonical === expected,
      verification: canonical === expected ? [] : [{ type: "local_pilot", expected, configured: canonical }],
    };
  }
  assertRemoteWhitelabelMutationAllowed({
    provider: "vercel",
    projectRef: params.projectRef,
    operation: "Vercel domain mutation",
  });
  const project = encodeURIComponent(params.projectRef);
  const domain = encodeURIComponent(params.domain);
  let response = await request(params.token, `/v9/projects/${project}/domains/${domain}${teamQuery(params.teamId)}`);
  if (response.status === 404) {
    response = await request(params.token, `/v9/projects/${project}/domains${teamQuery(params.teamId)}`, {
      method: "POST",
      body: JSON.stringify({ name: params.domain }),
    });
  }
  if (!response.ok) throw new Error(await apiError(response));
  let body = (await response.json()) as { name?: string; verified?: boolean; verification?: unknown[] };
  if (!body.verified) {
    const verify = await request(
      params.token,
      `/v9/projects/${project}/domains/${domain}/verify${teamQuery(params.teamId)}`,
      { method: "POST", body: "{}" },
    );
    if (verify.ok) body = (await verify.json()) as typeof body;
  }
  return { name: body.name ?? params.domain, verified: Boolean(body.verified), verification: body.verification ?? [] };
}
