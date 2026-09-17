import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const sentryEnvironment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
const sentryRelease = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SENTRY_RELEASE ?? "";
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const uploadSourceMaps = Boolean(sentryAuthToken);

const deploymentId = process.env.NEXT_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "local-dev";
const localRecordingDevOrigin = process.env.WHITELABEL_LOCAL_PILOT === "1" ? ["customer-a.local"] : undefined;

const nextConfig: NextConfig = {
  // Brand asset uploads are handled by Server Actions. The logo action accepts
  // files up to 5 MB, so keep the framework body limit slightly above that to
  // account for multipart/form-data overhead.
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  // Hide the on-screen dev route indicator (bottom-left "N"). Build/runtime
  // errors are still surfaced. (Next 16 removed the old sub-options.)
  devIndicators: false,
  // The recording customer is served through a trusted local HTTPS reverse
  // proxy while its isolated runtime stays on a loopback Next dev server.
  // Opt this origin in only for the explicit local-pilot mode so HMR/navigation
  // never hits Next's cross-origin dev-resource block during a recording.
  ...(localRecordingDevOrigin ? { allowedDevOrigins: localRecordingDevOrigin } : {}),
  // Next locks the dist dir to one dev server. A second local instance (e.g.
  // side-by-side role previews on another port) sets NEXT_DIST_DIR to get its
  // own build folder. Unset (all normal use and prod builds) means ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Version skew guard for rolling deploys: stale pages hard-navigate to a new
  // deployment instead of submitting server actions from the previous build.
  deploymentId,
  // Ticket 3's provisioning action reads the approved migration allowlist at
  // runtime. Only the Assembly Line control plane needs those SQL files traced.
  ...(process.env.WHITELABEL_ASSEMBLY_LINE_ENABLED === "1"
    ? {
        outputFileTracingIncludes: {
          "/admin/os-builds/**": ["./supabase/migrations/*.sql"],
        },
      }
    : {}),
  // Client + server Sentry.init must share preview/production labels. VERCEL_ENV
  // is not a NEXT_PUBLIC_ var, so stamp it at build time.
  env: {
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: sentryEnvironment,
    ...(sentryRelease ? { NEXT_PUBLIC_SENTRY_RELEASE: sentryRelease } : {}),
  },
};

export default withSentryConfig(nextConfig, {
  org: "systamazing",
  project: "javascript-nextjs",
  authToken: sentryAuthToken,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: uploadSourceMaps
    ? {
        // Cover Next 16 / Vercel `static/immutable` chunks as well as `static/chunks`.
        assets: [".next/server", ".next/static"],
        deleteSourcemapsAfterUpload: true,
      }
    : { disable: true },
  release: {
    name: sentryRelease || undefined,
    create: uploadSourceMaps,
    finalize: uploadSourceMaps,
  },
});
