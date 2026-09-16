import { NextResponse } from "next/server";
import { isWhitelabelLocalPilot, readLocalPilotDeploymentState } from "@/lib/local-pilot";

export const dynamic = "force-dynamic";

/**
 * Identifies the running deployment so open tabs can detect that a new
 * version shipped (see VersionWatcher). Vercel injects VERCEL_GIT_COMMIT_SHA
 * at build time; locally there is no deploy identity, so "dev" tells the
 * watcher to stay idle.
 */
export async function GET() {
  if (isWhitelabelLocalPilot()) {
    const projectRef = process.env.WHITELABEL_LOCAL_PILOT_PROJECT_REF?.trim();
    if (projectRef) {
      const state = await readLocalPilotDeploymentState(projectRef);
      return NextResponse.json(
        {
          sha: state.sourceSha ?? "dev",
          schemaRelease: state.environment.INSTALLATION_SCHEMA_RELEASE ?? null,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
  }
  return NextResponse.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
      schemaRelease: process.env.INSTALLATION_SCHEMA_RELEASE ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
