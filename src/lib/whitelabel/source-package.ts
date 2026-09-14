import { unzipSync } from "fflate";

export const SOURCE_PACKAGE_MANIFEST = "WHITELABEL_SOURCE_MANIFEST.json";
const MAX_UNCOMPRESSED_BYTES = 350 * 1024 * 1024;

const CONTROL_PLANE_PREFIXES = [
  "src/app/admin/os-builds/",
  "src/components/admin/os-builds/",
  "src/lib/whitelabel/",
] as const;

const CONTROL_PLANE_FILES = new Set([
  "src/lib/actions/admin/os-builds.ts",
  "src/lib/actions/admin/os-provisioning.ts",
  "src/lib/actions/admin/os-verification.ts",
]);

const HIGH_CONFIDENCE_SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/i,
  /\bsbp_[A-Za-z0-9_-]{20,}\b/i,
  /\b(?:ghp|github_pat|xox[baprs]|sb_secret)_[A-Za-z0-9_-]{16,}\b/i,
  /\bre_[A-Za-z0-9_-]{20,}\b/i,
] as const;

const RUNTIME_SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
  /\b(?:api[_ -]?key|secret|token|password)\s*[:=]\s*(["'`])[A-Za-z0-9._~+/=-]{12,}\1/i,
] as const;

function normalized(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function sourcePackagePathAllowed(path: string): boolean {
  const name = normalized(path);
  const segments = name.split("/");
  if (segments.some((part) => part === ".git" || part === ".next" || part === "node_modules" || part === ".vercel" || part === ".agents" || part === ".gitnexus")) return false;
  if (name === "AGENTS.md") return false;
  if (segments.some((part) => part === ".env" || part.startsWith(".env."))) return false;
  if (/\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(name)) return false;
  if (/(?:^|\/)(?:credentials|service-account|service_account)(?:\.[^/]*)?\.json$/i.test(name)) return false;
  if (CONTROL_PLANE_FILES.has(name)) return false;
  if (CONTROL_PLANE_PREFIXES.some((prefix) => name.startsWith(prefix))) return false;
  return true;
}

function textLike(path: string): boolean {
  return /\.(?:[cm]?[jt]sx?|json|md|txt|sql|css|html?|ya?ml|toml|xml|csv|sh|ps1|env)$/i.test(path)
    || /(?:^|\/)(?:Dockerfile|Procfile|README)$/i.test(path);
}

export function assertNoLiteralSecrets(path: string, bytes: Uint8Array): void {
  if (!textLike(path)) return;
  const text = new TextDecoder().decode(bytes);
  const testFixture = /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/i.test(normalized(path));
  if (
    HIGH_CONFIDENCE_SECRET_PATTERNS.some((pattern) => pattern.test(text))
    || (!testFixture && RUNTIME_SECRET_PATTERNS.some((pattern) => pattern.test(text)))
  ) {
    throw new Error(`Source package secret scan failed in ${path}.`);
  }
}

export type SourcePackageManifest = {
  formatVersion: 1;
  sourceSha: string;
  schemaRelease: string;
  customerMigrations: string[];
  controlPlaneExcluded: true;
  secretScan: "passed";
};

export function inspectSourcePackageZip(bytes: Uint8Array): SourcePackageManifest {
  const entries = unzipSync(bytes);
  let total = 0;
  for (const [path, content] of Object.entries(entries)) {
    total += content.byteLength;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new Error("Source package expands beyond the allowed size.");
    if (!sourcePackagePathAllowed(path)) throw new Error(`Source package contains forbidden path: ${path}`);
    assertNoLiteralSecrets(path, content);
  }

  const manifestBytes = entries[SOURCE_PACKAGE_MANIFEST];
  if (!manifestBytes) throw new Error("Source package manifest is missing.");
  let manifest: SourcePackageManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as SourcePackageManifest;
  } catch {
    throw new Error("Source package manifest is invalid JSON.");
  }
  if (
    manifest.formatVersion !== 1
    || !/^[0-9a-f]{7,64}$/i.test(manifest.sourceSha)
    || !manifest.schemaRelease
    || manifest.controlPlaneExcluded !== true
    || manifest.secretScan !== "passed"
    || !Array.isArray(manifest.customerMigrations)
  ) {
    throw new Error("Source package manifest does not satisfy the handoff contract.");
  }

  const migrationEntries = Object.keys(entries)
    .map(normalized)
    .filter((path) => path.startsWith("supabase/migrations/") && path.endsWith(".sql"))
    .map((path) => path.slice("supabase/migrations/".length))
    .sort();
  const declared = [...manifest.customerMigrations].sort();
  if (JSON.stringify(migrationEntries) !== JSON.stringify(declared)) {
    throw new Error("Source package database migrations do not match the manifest.");
  }
  if (migrationEntries.some((name) => /gateway/i.test(name) || /2026091400(?:10|30|50)00/.test(name))) {
    throw new Error("Source package contains a control-plane or Gateway migration.");
  }
  return manifest;
}
