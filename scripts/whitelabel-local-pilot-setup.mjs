import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.env.WHITELABEL_LOCAL_PILOT_ROOT || "E:\\LocalPilot\\whitelabel-pilot";
const supabase = process.env.SUPABASE_CLI || "supabase";

const stacks = [
  {
    projectRef: "local-control",
    dir: "E:\\LocalPilot\\whitelabel-control",
    canonicalAppUrl: "https://control.local",
    runtimeAppUrl: "http://127.0.0.1:3000",
  },
  {
    projectRef: "local-customer-a",
    dir: "E:\\LocalPilot\\whitelabel-customer-a",
    canonicalAppUrl: "https://customer-a.local",
    runtimeAppUrl: "http://127.0.0.1:3101",
  },
  {
    projectRef: "local-customer-b",
    dir: "E:\\LocalPilot\\whitelabel-customer-b",
    canonicalAppUrl: "https://customer-b.local",
    runtimeAppUrl: "http://127.0.0.1:3102",
  },
];

function status(dir) {
  const raw = execFileSync(supabase, ["status", "--workdir", dir, "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(raw);
}

const projects = stacks.map((stack) => {
  const value = status(stack.dir);
  if (!value.API_URL || !value.DB_URL || !value.PUBLISHABLE_KEY || !value.SECRET_KEY) {
    throw new Error(`Supabase stack ${stack.projectRef} is missing required local status values.`);
  }
  return {
    projectRef: stack.projectRef,
    accountRef: "local",
    apiUrl: value.API_URL,
    dbUrl: value.DB_URL,
    publishableKey: value.PUBLISHABLE_KEY,
    secretKey: value.SECRET_KEY,
    canonicalAppUrl: stack.canonicalAppUrl,
    runtimeAppUrl: stack.runtimeAppUrl,
  };
});

mkdirSync(root, { recursive: true });
const registryPath = path.join(root, "registry.json");
writeFileSync(registryPath, `${JSON.stringify({ projects }, null, 2)}\n`, "utf8");

const control = projects[0];
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const envPath = path.join(process.cwd(), ".env.local");
const env = [
  `NEXT_PUBLIC_SUPABASE_URL=${control.apiUrl}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${control.publishableKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${control.secretKey}`,
  "NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000",
  "DEV_LOGIN_ENABLED=true",
  "DEV_LOGIN_PASSWORD=allstar-dev-login",
  "WHITELABEL_LOCAL_PILOT=1",
  `WHITELABEL_LOCAL_PILOT_ROOT=${root}`,
  `WHITELABEL_LOCAL_PILOT_REGISTRY=${registryPath}`,
  `WHITELABEL_SOURCE_SHA=${sourceSha}`,
];
writeFileSync(envPath, `${env.join("\n")}\n`, "utf8");

console.log(JSON.stringify({
  registryPath,
  envPath,
  projectRefs: projects.map((project) => project.projectRef),
  sourceSha,
}));
