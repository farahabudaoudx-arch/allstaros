import { readFileSync } from "node:fs";
import path from "node:path";

const target = (process.argv[2] ?? "a").toLowerCase();
if (target !== "a" && target !== "b") {
  throw new Error("Usage: node scripts/whitelabel-local-pilot-seed-full.mjs <a|b>");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("Local pilot full-schema seeding is forbidden in production.");
}

const root = process.env.WHITELABEL_LOCAL_PILOT_ROOT || "E:\\LocalPilot\\whitelabel-pilot";
const registryPath = process.env.WHITELABEL_LOCAL_PILOT_REGISTRY || path.join(root, "registry.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const projectRef = target === "a" ? "local-customer-a" : "local-customer-b";
const project = registry.projects.find((row) => row.projectRef === projectRef);
if (!project) throw new Error(`Local pilot registry does not contain ${projectRef}.`);

process.env.NEXT_PUBLIC_SUPABASE_URL = project.apiUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = project.secretKey;
process.env.SCALE_SEED_BUILDER_EMAIL = process.env.SCALE_SEED_BUILDER_EMAIL || "builder@allstar.test";
process.env.SCALE_SEED_PROJECT_REF = new URL(project.apiUrl).host;

await import("./seed-full-schema.mjs");
