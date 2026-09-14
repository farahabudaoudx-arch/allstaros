import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, unzipSync, zipSync } from "fflate";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const requestedSha = value("--sha");
const output = value("--out");
const uploadRequested = args.includes("--upload");
const buildId = value("--build-id");
const handoffId = value("--handoff-id");
if (!requestedSha || !output) {
  throw new Error("Usage: node scripts/build-whitelabel-source-package.mjs --sha <git-sha> --out <package.zip> [--upload --build-id <uuid> --handoff-id <uuid>]");
}

const sourceSha = execFileSync("git", ["rev-parse", "--verify", `${requestedSha}^{commit}`], { encoding: "utf8" }).trim();
const cleanSchemaSource = execFileSync("git", ["show", `${sourceSha}:src/lib/whitelabel/provisioning/clean-schema.ts`], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
const migrationsBlock = cleanSchemaSource.match(/CLEAN_CUSTOMER_MIGRATIONS\s*=\s*\[([\s\S]*?)\]\s*as const/);
if (!migrationsBlock) throw new Error("Could not read the clean customer migration manifest from the requested source SHA.");
const customerMigrations = [...migrationsBlock[1].matchAll(/"([^"]+\.sql)"/g)].map((match) => match[1]);
if (customerMigrations.length === 0) throw new Error("Clean customer migration manifest is empty.");

const temp = mkdtempSync(path.join(tmpdir(), "whitelabel-source-"));
const rawArchive = path.join(temp, "source.zip");
try {
  execFileSync("git", ["archive", "--format=zip", `--output=${rawArchive}`, sourceSha]);
  const entries = unzipSync(readFileSync(rawArchive));
  const migrationSet = new Set(customerMigrations);
  const filtered = {};
  const forbiddenPrefix = ["src/app/admin/os-builds/", "src/components/admin/os-builds/", "src/lib/whitelabel/"];
  const forbiddenFile = new Set(["src/lib/actions/admin/os-builds.ts", "src/lib/actions/admin/os-provisioning.ts", "src/lib/actions/admin/os-verification.ts"]);
  const highConfidenceSecretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/i,
    /\bsbp_[A-Za-z0-9_-]{20,}\b/i,
    /\b(?:ghp|github_pat|xox[baprs]|sb_secret)_[A-Za-z0-9_-]{16,}\b/i,
    /\bre_[A-Za-z0-9_-]{20,}\b/i,
  ];
  const runtimeSecretPatterns = [
    /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
    /\b(?:api[_ -]?key|secret|token|password)\s*[:=]\s*(["'`])[A-Za-z0-9._~+/=-]{12,}\1/i,
  ];
  const isText = (name) => /\.(?:[cm]?[jt]sx?|json|md|txt|sql|css|html?|ya?ml|toml|xml|csv|sh|ps1)$/i.test(name);

  for (const [rawName, bytes] of Object.entries(entries)) {
    const name = rawName.replaceAll("\\", "/");
    const segments = name.split("/");
    if (segments.some((part) => [".git", ".next", "node_modules", ".vercel", ".agents", ".gitnexus"].includes(part))) continue;
    if (name === "AGENTS.md") continue;
    if (segments.some((part) => part === ".env" || part.startsWith(".env."))) continue;
    if (/\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(name)) continue;
    if (/(?:^|\/)(?:credentials|service-account|service_account)(?:\.[^/]*)?\.json$/i.test(name)) continue;
    if (forbiddenFile.has(name) || forbiddenPrefix.some((prefix) => name.startsWith(prefix))) continue;
    if (name.startsWith("supabase/migrations/")) {
      const migrationName = name.slice("supabase/migrations/".length);
      if (!migrationSet.has(migrationName)) continue;
      if (/gateway/i.test(migrationName)) throw new Error(`Gateway migration leaked into clean customer manifest: ${migrationName}`);
    }
    if (isText(name)) {
      const text = new TextDecoder().decode(bytes);
      const testFixture = /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/i.test(name);
      if (
        highConfidenceSecretPatterns.some((pattern) => pattern.test(text))
        || (!testFixture && runtimeSecretPatterns.some((pattern) => pattern.test(text)))
      ) throw new Error(`Secret scan failed in ${name}`);
    }
    filtered[name] = bytes;
  }

  const schemaRelease = customerMigrations.at(-1).replace(/\.sql$/, "");
  const manifest = {
    formatVersion: 1,
    sourceSha,
    schemaRelease,
    customerMigrations,
    controlPlaneExcluded: true,
    secretScan: "passed",
  };
  filtered["WHITELABEL_SOURCE_MANIFEST.json"] = strToU8(JSON.stringify(manifest, null, 2) + "\n");
  filtered["CUSTOMER_DATABASE_SETUP.md"] = strToU8(
    `# Customer database setup\n\nApply the migrations listed in WHITELABEL_SOURCE_MANIFEST.json in order, then perform the clean-customer data reset before creating the initial admin. Assembly Line and Gateway migrations are intentionally excluded.\n`,
  );
  const zipBytes = zipSync(filtered, { level: 6 });
  writeFileSync(output, zipBytes);
  const digest = createHash("sha256").update(zipBytes).digest("hex");
  writeFileSync(`${output}.sha256`, `${digest}  ${path.basename(output)}\n`);
  const result = { output, sourceSha, schemaRelease, files: Object.keys(filtered).length, sha256: digest, uploaded: false };

  if (uploadRequested) {
    if (!buildId || !handoffId) throw new Error("--upload requires --build-id and --handoff-id.");
    const supabaseUrl = process.env.WHITELABEL_CONTROL_PLANE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Control-plane Supabase URL and SUPABASE_SERVICE_ROLE_KEY are required for --upload.");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: handoff, error: handoffError } = await supabase
      .from("whitelabel_handoff")
      .select("id, build_id, installed_source_sha, schema_release")
      .eq("id", handoffId)
      .eq("build_id", buildId)
      .maybeSingle();
    if (handoffError || !handoff) throw new Error("Canonical handoff not found for the requested build.");
    if (handoff.installed_source_sha !== sourceSha || handoff.schema_release !== schemaRelease) {
      throw new Error("Package source/schema does not match the canonical handoff.");
    }
    const { data: latest, error: latestError } = await supabase
      .from("whitelabel_handoff_artifact")
      .select("revision")
      .eq("handoff_id", handoffId)
      .eq("build_id", buildId)
      .eq("kind", "source_package")
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw new Error("Could not determine source-package revision.");
    const revision = (latest?.revision ?? 0) + 1;
    const storagePath = `${buildId}/${handoffId}/source_package/r${revision}.zip`;
    const upload = await supabase.storage.from("whitelabel-handoff-artifacts").upload(storagePath, zipBytes, {
      contentType: "application/zip",
      upsert: false,
    });
    if (upload.error) throw new Error("Private source-package upload failed.");
    const registered = await supabase.from("whitelabel_handoff_artifact").insert({
      handoff_id: handoffId,
      build_id: buildId,
      kind: "source_package",
      revision,
      storage_path: storagePath,
      sha256: digest,
      byte_size: zipBytes.byteLength,
      content_type: "application/zip",
      safe_metadata: {
        sourceSha,
        schemaRelease,
        secretScan: "passed",
        controlPlaneExcluded: true,
      },
    });
    if (registered.error) {
      await supabase.storage.from("whitelabel-handoff-artifacts").remove([storagePath]);
      throw new Error("Source package uploaded but registration failed; upload was rolled back.");
    }
    result.uploaded = true;
    result.revision = revision;
    result.storagePath = storagePath;
  }

  process.stdout.write(JSON.stringify(result) + "\n");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
