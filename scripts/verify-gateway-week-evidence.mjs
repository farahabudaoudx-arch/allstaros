import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Run from the repository root with node --env-file=.env.local.
// This gate is deliberately restricted to the existing DEV project.
const project = "oyuqwuvewyntnxfboutd";
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, `${project}.supabase.co`);
assert.ok(process.env.SUPABASE_ACCESS_TOKEN, "A Supabase Management token is required.");

async function query(sql, readOnly = false) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
    signal: AbortSignal.timeout(45_000),
  });
  const result = await response.json();
  assert.ok(response.ok, `DEV SQL failed (${response.status}): ${JSON.stringify(result)}`);
  return result;
}

const baselineSql = `select
  (select max(version) from supabase_migrations.schema_migrations) as latest_migration,
  to_regclass('public.scorecard_auto_publish_period') is not null as period_ledger_exists,
  exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='gateway_report_pull_job' and column_name='claim_token') as claim_token_exists,
  (select count(*) from public.person where email like 'week-evidence-%@acceptance.invalid') as acceptance_people,
  (select count(*) from public.gateway_connection where session_ref='week-evidence-acceptance') as acceptance_sessions`;
const before = await query(baselineSql, true);
assert.equal(Number(before[0].acceptance_people), 0);
assert.equal(Number(before[0].acceptance_sessions), 0);
const migration = await readFile("supabase/migrations/20260905000100_gateway_runner_hardening.sql", "utf8");
const acceptance = (await readFile("supabase/tests/gateway-week-evidence.sql", "utf8")).replace(/^\uFEFF/, "");
// Prevent an edited input file from closing our rollback boundary.
assert.doesNotMatch(migration + acceptance, /^\s*(commit|rollback|end\s+transaction)\s*;/im);
try {
  await query(`BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s';
${migration}
${acceptance}
ROLLBACK;`);
  console.log("PASS: full hardening migration and provider-week metadata acceptance inside rollback.");
} finally {
  const after = await query(baselineSql, true);
  assert.deepEqual(after, before, "DEV schema ledger or synthetic data changed after rollback.");
  console.log("PASS: post-rollback DEV schema ledger and synthetic data match the read-only baseline.");
}
