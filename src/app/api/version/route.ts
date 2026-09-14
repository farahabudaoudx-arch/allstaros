import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Identifies the running deployment so open tabs can detect that a new
 * version shipped (see VersionWatcher). Vercel injects VERCEL_GIT_COMMIT_SHA
 * at build time; locally there is no deploy identity, so "dev" tells the
 * watcher to stay idle.
 */
export async function GET() {
  return NextResponse.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
      schemaRelease: process.env.INSTALLATION_SCHEMA_RELEASE ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
