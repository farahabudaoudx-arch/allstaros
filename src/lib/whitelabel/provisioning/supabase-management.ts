import "server-only";

const API = "https://api.supabase.com/v1";

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

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    return body.message || body.error || `Supabase returned HTTP ${response.status}.`;
  } catch {
    return `Supabase returned HTTP ${response.status}.`;
  }
}

type HealthEntry = { name?: string; status?: string; service?: string };

function healthEntries(value: unknown): HealthEntry[] {
  if (Array.isArray(value)) return value.filter((row): row is HealthEntry => Boolean(row) && typeof row === "object");
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["services", "data", "result"]) {
    if (Array.isArray(record[key])) return healthEntries(record[key]);
  }
  return [];
}

export async function assertSupabaseProjectHealthy(params: {
  token: string;
  projectRef: string;
  services?: string[];
}) {
  const response = await request(params.token, `/projects/${encodeURIComponent(params.projectRef)}/health`);
  if (!response.ok) throw new Error(await errorText(response));
  const body = await response.json();
  const rows = healthEntries(body);
  const wanted = new Set((params.services ?? ["db", "auth", "rest", "storage"]).map((name) => name.toLowerCase()));
  const unhealthy = rows.filter((row) => {
    const name = (row.name ?? row.service ?? "").toLowerCase();
    return wanted.has(name) && row.status !== "ACTIVE_HEALTHY";
  });
  const observed = new Set(rows.map((row) => (row.name ?? row.service ?? "").toLowerCase()).filter(Boolean));
  const missing = [...wanted].filter((name) => !observed.has(name));
  if (unhealthy.length || missing.length) {
    const detail = [
      ...unhealthy.map((row) => `${row.name ?? row.service}:${row.status ?? "unknown"}`),
      ...missing.map((name) => `${name}:missing`),
    ].join(", ");
    throw new Error(`Supabase project services are not ACTIVE_HEALTHY yet (${detail}). Retry provisioning after the project is healthy.`);
  }
}

export async function runSupabaseSql(params: {
  token: string;
  projectRef: string;
  query: string;
  parameters?: unknown[];
}): Promise<unknown> {
  const response = await request(params.token, `/projects/${encodeURIComponent(params.projectRef)}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: params.query, parameters: params.parameters ?? [] }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

export async function getSupabaseProjectKeys(params: { token: string; projectRef: string }) {
  const response = await request(
    params.token,
    `/projects/${encodeURIComponent(params.projectRef)}/api-keys?reveal=true`,
  );
  if (!response.ok) throw new Error(await errorText(response));
  const rows = (await response.json()) as Array<{ id?: string; name?: string; type?: string; api_key?: string }>;
  const publicRow = rows.find((row) => row.type === "publishable" || row.name === "anon");
  const secretRow = rows.find((row) => row.type === "secret" || row.name === "service_role");
  if (!publicRow?.api_key || !secretRow?.api_key) {
    throw new Error("Supabase project API keys are not available yet.");
  }
  return { publishableKey: publicRow.api_key, secretKey: secretRow.api_key };
}

export async function updateSupabaseAuthConfig(params: {
  token: string;
  projectRef: string;
  siteUrl: string;
}) {
  const response = await request(params.token, `/projects/${encodeURIComponent(params.projectRef)}/config/auth`, {
    method: "PATCH",
    body: JSON.stringify({
      site_url: params.siteUrl,
      uri_allow_list: `${params.siteUrl}/auth/callback,${params.siteUrl}/auth/confirm,${params.siteUrl}/welcome`,
      disable_signup: true,
    }),
  });
  if (!response.ok) throw new Error(await errorText(response));
}

export async function uploadSupabaseStorageObject(params: {
  projectRef: string;
  secretKey: string;
  bucket: string;
  objectPath: string;
  contentType: string;
  body: ArrayBuffer;
}) {
  const response = await fetch(
    `https://${params.projectRef}.supabase.co/storage/v1/object/${encodeURIComponent(params.bucket)}/${params.objectPath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.secretKey}`,
        apikey: params.secretKey,
        "Content-Type": params.contentType,
        "x-upsert": "true",
      },
      body: params.body,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!response.ok) throw new Error(`Customer Storage returned HTTP ${response.status}.`);
  return `https://${params.projectRef}.supabase.co/storage/v1/object/public/${params.bucket}/${params.objectPath}`;
}
