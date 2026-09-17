import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.WHITELABEL_LOCAL_PILOT_ROOT || "E:\\LocalPilot\\whitelabel-pilot";
const registryPath = process.env.WHITELABEL_LOCAL_PILOT_REGISTRY || path.join(root, "registry.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const project = registry.projects.find((row) => row.projectRef === "local-customer-a");
if (!project) throw new Error("local-customer-a is missing from the local pilot registry.");

const port = process.env.LOCAL_DEMO_PORT || "3201";
const command = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(command, ["run", "build"], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: project.apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: project.publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: project.secretKey,
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
    WHITELABEL_LOCAL_PILOT: "1",
    WHITELABEL_LOCAL_PILOT_ALLOW_NEXT_START: "1",
    WHITELABEL_ASSEMBLY_LINE_ENABLED: "1",
    DEV_LOGIN_ENABLED: "false",
    DEV_LOGIN_SECRET: process.env.LOCAL_DEMO_LOGIN_SECRET || "local-demo-only",
  },
});

if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
