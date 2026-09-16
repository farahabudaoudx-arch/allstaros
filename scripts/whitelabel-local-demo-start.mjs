import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.WHITELABEL_LOCAL_PILOT_ROOT || "E:\\LocalPilot\\whitelabel-pilot";
const registryPath = process.env.WHITELABEL_LOCAL_PILOT_REGISTRY || path.join(root, "registry.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const project = registry.projects.find((row) => row.projectRef === "local-customer-a");
if (!project) throw new Error("local-customer-a is missing from the local pilot registry.");

const port = process.env.LOCAL_DEMO_PORT || "3201";
const secret = process.env.LOCAL_DEMO_LOGIN_SECRET || "local-demo-only";
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

console.log(`Local demo: http://127.0.0.1:${port}`);
console.log(`Role switcher: http://127.0.0.1:${port}/auth/dev?key=${secret}`);
console.log("This process uses local Customer A Supabase only. Press Ctrl+C to stop the app.");

const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", port], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: project.apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: project.publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: project.secretKey,
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
    WHITELABEL_LOCAL_PILOT: "0",
    WHITELABEL_ASSEMBLY_LINE_ENABLED: "1",
    DEV_LOGIN_ENABLED: "false",
    DEV_LOGIN_SECRET: secret,
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
