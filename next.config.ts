import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const sentryEnvironment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
const sentryRelease = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SENTRY_RELEASE ?? "";
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const uploadSourceMaps = Boolean(sentryAuthToken);

const deploymentId = process.env.NEXT_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "local-dev";

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
  // Next locks the dist dir to one dev server. A second local instance (e.g.
  // side-by-side role previews on another port) sets NEXT_DIST_DIR to get its
  // own build folder. Unset (all normal use and prod builds) means ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Version skew guard for rolling deploys: stale pages hard-navigate to a new
  // deployment instead of submitting server actions from the previous build.
  deploymentId,
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
