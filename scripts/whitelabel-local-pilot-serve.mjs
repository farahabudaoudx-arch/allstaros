import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const target = (process.argv[2] ?? "control").toLowerCase();
const definitions = {
  control: { projectRef: "local-control", port: "3000", dist: ".next-local-control-fast" },
  a: { projectRef: "local-customer-a", port: "3101", dist: ".next-local-a-fast" },
  b: { projectRef: "local-customer-b", port: "3102", dist: ".next-local-b-fast" },
};
const definition = definitions[target];
if (!definition) throw new Error("Usage: node scripts/whitelabel-local-pilot-serve.mjs <control|a|b>");

const root = process.env.WHITELABEL_LOCAL_PILOT_ROOT || "E:\\LocalPilot\\whitelabel-pilot";
const registryPath = process.env.WHITELABEL_LOCAL_PILOT_REGISTRY || path.join(root, "registry.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const project = registry.projects.find((row) => row.projectRef === definition.projectRef);
if (!project) throw new Error(`Local pilot registry does not contain ${definition.projectRef}.`);

const deploymentStatePath = path.join(root, "deployments", `${definition.projectRef}.json`);
const deploymentEnvironment = existsSync(deploymentStatePath)
  ? JSON.parse(readFileSync(deploymentStatePath, "utf8")).environment ?? {}
  : {};

const env = {
  ...process.env,
  ...deploymentEnvironment,
  NODE_ENV: "development",
  WHITELABEL_LOCAL_PILOT: "1",
  WHITELABEL_LOCAL_PILOT_ROOT: root,
  WHITELABEL_LOCAL_PILOT_REGISTRY: registryPath,
  WHITELABEL_LOCAL_PILOT_PROJECT_REF: definition.projectRef,
  NEXT_DIST_DIR: definition.dist,
  NEXT_PUBLIC_SUPABASE_URL: project.apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: project.publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: project.secretKey,
  NEXT_PUBLIC_APP_URL: project.runtimeAppUrl,
  DEV_LOGIN_ENABLED: "true",
  DEV_LOGIN_PASSWORD: process.env.DEV_LOGIN_PASSWORD || "allstar-dev-login",
};

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "-p", definition.port], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
