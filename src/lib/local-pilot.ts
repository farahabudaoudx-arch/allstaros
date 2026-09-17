import "server-only";

import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

export type LocalPilotProject = {
  projectRef: string;
  accountRef: string;
  apiUrl: string;
  dbUrl: string;
  publishableKey: string;
  secretKey: string;
  canonicalAppUrl?: string;
  runtimeAppUrl?: string;
};

export type LocalPilotDeploymentState = {
  environment: Record<string, string>;
  sourceSha: string | null;
  deploymentRef: string | null;
  deploymentUrl: string | null;
  updatedAt: string;
};

type LocalPilotRegistry = {
  projects: LocalPilotProject[];
};

function isExplicitLoopbackNextStart(): boolean {
  if (process.env.WHITELABEL_LOCAL_PILOT_ALLOW_NEXT_START !== "1") return false;
  if (!process.env.WHITELABEL_LOCAL_PILOT_REGISTRY?.trim()) return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) return false;
  try {
    const url = new URL(appUrl);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function assertLocalOnly(): void {
  if (process.env.NODE_ENV === "production" && !isExplicitLoopbackNextStart()) {
    throw new Error("WHITELABEL_LOCAL_PILOT is forbidden in production.");
  }
}

export function isWhitelabelLocalPilot(): boolean {
  const enabled = process.env.WHITELABEL_LOCAL_PILOT === "1";
  if (enabled) assertLocalOnly();
  return enabled;
}

function pilotRoot(): string {
  assertLocalOnly();
  const configured = process.env.WHITELABEL_LOCAL_PILOT_ROOT?.trim();
  return configured || path.join(process.cwd(), ".local", "whitelabel-pilot");
}

function registryPath(): string {
  const configured = process.env.WHITELABEL_LOCAL_PILOT_REGISTRY?.trim();
  return configured || path.join(pilotRoot(), "registry.json");
}

async function loadRegistry(): Promise<LocalPilotRegistry> {
  assertLocalOnly();
  const raw = await readFile(/* turbopackIgnore: true */ registryPath(), "utf8");
  const parsed = JSON.parse(raw) as Partial<LocalPilotRegistry>;
  if (!Array.isArray(parsed.projects)) throw new Error("Local pilot registry is missing projects[].");
  return { projects: parsed.projects as LocalPilotProject[] };
}

export async function localPilotProject(projectRef: string): Promise<LocalPilotProject> {
  const registry = await loadRegistry();
  const project = registry.projects.find((row) => row.projectRef === projectRef);
  if (!project) throw new Error(`Local pilot project ${projectRef} is not registered.`);
  return project;
}

function statePath(projectRef: string): string {
  return path.join(pilotRoot(), "deployments", `${projectRef}.json`);
}

export async function readLocalPilotDeploymentState(projectRef: string): Promise<LocalPilotDeploymentState> {
  assertLocalOnly();
  try {
    const raw = await readFile(statePath(projectRef), "utf8");
    const parsed = JSON.parse(raw) as LocalPilotDeploymentState;
    return {
      environment: parsed.environment ?? {},
      sourceSha: parsed.sourceSha ?? null,
      deploymentRef: parsed.deploymentRef ?? null,
      deploymentUrl: parsed.deploymentUrl ?? null,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code !== "ENOENT") throw error;
    return {
      environment: {},
      sourceSha: null,
      deploymentRef: null,
      deploymentUrl: null,
      updatedAt: new Date(0).toISOString(),
    };
  }
}

export async function patchLocalPilotDeploymentState(
  projectRef: string,
  patch: Partial<Omit<LocalPilotDeploymentState, "updatedAt">>,
): Promise<LocalPilotDeploymentState> {
  assertLocalOnly();
  const current = await readLocalPilotDeploymentState(projectRef);
  const next: LocalPilotDeploymentState = {
    ...current,
    ...patch,
    environment: patch.environment ? { ...current.environment, ...patch.environment } : current.environment,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(statePath(projectRef)), { recursive: true });
  await writeFile(statePath(projectRef), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function localPilotRuntimeUrlForCanonical(canonicalUrl: string): Promise<string> {
  const normalized = canonicalUrl.replace(/\/+$/, "");
  const registry = await loadRegistry();
  const project = registry.projects.find((row) => row.canonicalAppUrl?.replace(/\/+$/, "") === normalized);
  return project?.runtimeAppUrl?.replace(/\/+$/, "") || normalized;
}

export async function localPilotProjectRefForCanonical(canonicalUrl: string): Promise<string | null> {
  return (await localPilotProjectByCanonicalAppUrl(canonicalUrl))?.projectRef ?? null;
}

export async function localPilotSupabaseApiUrl(projectRef: string): Promise<string> {
  return (await localPilotProject(projectRef)).apiUrl.replace(/\/+$/, "");
}

export async function localPilotProjectByCanonicalAppUrl(canonicalUrl: string): Promise<LocalPilotProject | null> {
  const normalized = canonicalUrl.replace(/\/+$/, "");
  const registry = await loadRegistry();
  return registry.projects.find((row) => row.canonicalAppUrl?.replace(/\/+$/, "") === normalized) ?? null;
}

export async function localPilotCanonicalAppUrl(projectRef: string): Promise<string | null> {
  const project = await localPilotProject(projectRef);
  return project.canonicalAppUrl?.replace(/\/+$/, "") ?? null;
}

export async function recordLocalPilotEmail(args: {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  idempotencyKey?: string;
}): Promise<string> {
  assertLocalOnly();
  const id = `local-mail-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const target = path.join(pilotRoot(), "mail", "outbox.jsonl");
  await mkdir(path.dirname(target), { recursive: true });
  await appendFile(target, `${JSON.stringify({ id, createdAt: new Date().toISOString(), ...args })}\n`, "utf8");
  return id;
}
