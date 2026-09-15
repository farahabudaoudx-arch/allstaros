import type { LiveVersionEvidence } from "@/lib/whitelabel/verification";
import type {
  CompatibilityVerification,
  OperationalVerificationItem,
  PostUpdateVerification,
} from "./types";

function automatedItem(args: {
  key: string;
  label: string;
  expected: string;
  ok: boolean;
  actual: string;
  evidence?: Record<string, unknown>;
}): OperationalVerificationItem {
  return {
    checkKey: args.key,
    label: args.label,
    category: "operations",
    mode: "automated",
    required: true,
    status: args.ok ? "passed" : "failed",
    expectedSummary: args.expected,
    actualSummary: args.actual,
    evidence: args.evidence,
  };
}

export function buildPostUpdateVerification(args: {
  liveVersion: LiveVersionEvidence;
  expectedMigrationNames: readonly string[];
  actualMigrationNames: readonly string[];
}): PostUpdateVerification {
  const actual = new Set(args.actualMigrationNames);
  const missing = args.expectedMigrationNames.filter((name) => !actual.has(name));
  return {
    kind: "post_update",
    items: [
      automatedItem({
        key: "live-version",
        label: "Live source and schema after update",
        expected: "The customer URL reports the exact release source SHA and schema release.",
        ok: args.liveVersion.ok,
        actual: args.liveVersion.summary,
        evidence: args.liveVersion.evidence,
      }),
      automatedItem({
        key: "migration-lineage",
        label: "Pinned customer migration lineage",
        expected: "Every migration pinned by the release through the target schema is marked as applied.",
        ok: missing.length === 0,
        actual: missing.length ? `Missing markers: ${missing.join(", ")}.` : "Pinned release markers are present.",
        evidence: { expected: [...args.expectedMigrationNames], actual: [...args.actualMigrationNames], missing },
      }),
    ],
  };
}

export function buildCompatibilityVerification(args: {
  liveSourceSha: string | null;
  liveSchemaRelease: string | null;
  knownSourceShas: readonly string[];
  knownSchemaReleases: readonly string[];
  actualMigrationNames: readonly string[];
  knownMigrationNames: readonly string[];
  providerRefsMatch: boolean;
}): CompatibilityVerification {
  const unknownMarkers = args.actualMigrationNames.filter((name) => !args.knownMigrationNames.includes(name) && name !== "__whitelabel_clean_customer_data_v1__");
  const sourceKnown = Boolean(args.liveSourceSha && args.knownSourceShas.includes(args.liveSourceSha));
  const schemaKnown = Boolean(args.liveSchemaRelease && args.knownSchemaReleases.includes(args.liveSchemaRelease));
  const items = [
    automatedItem({
      key: "known-source",
      label: "Known installed source",
      expected: "The independent installation runs a source SHA known to the managed release history.",
      ok: sourceKnown,
      actual: sourceKnown ? `Known source ${args.liveSourceSha}.` : `Unknown source ${args.liveSourceSha ?? "missing"}.`,
      evidence: { liveSourceSha: args.liveSourceSha },
    }),
    automatedItem({
      key: "known-schema",
      label: "Known installed schema",
      expected: "The live schema release belongs to the managed customer migration lineage.",
      ok: schemaKnown,
      actual: schemaKnown ? `Known schema ${args.liveSchemaRelease}.` : `Unknown schema ${args.liveSchemaRelease ?? "missing"}.`,
      evidence: { liveSchemaRelease: args.liveSchemaRelease },
    }),
    automatedItem({
      key: "migration-drift",
      label: "No unmanaged database migration drift",
      expected: "The customer database contains only known managed/install-only migration markers.",
      ok: unknownMarkers.length === 0,
      actual: unknownMarkers.length ? `Unknown markers: ${unknownMarkers.join(", ")}.` : "No unknown migration markers detected.",
      evidence: { unknownMarkers },
    }),
    automatedItem({
      key: "provider-refs",
      label: "Customer provider references still match",
      expected: "Managed operations still point at the handed-off customer Vercel and Supabase projects.",
      ok: args.providerRefsMatch,
      actual: args.providerRefsMatch ? "Provider references match." : "Provider references changed; automatic overwrite is blocked.",
    }),
  ];
  return { kind: "compatibility", compatible: items.every((item) => item.status === "passed"), items };
}
