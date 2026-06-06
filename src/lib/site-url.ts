/**
 * The app's public base URL, used to build absolute links in emails and
 * invites (where there's no `window` or request to derive an origin from).
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APP_URL          — set this in Vercel for production.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable production domain;
 *      a safety net so a forgotten env var still points at the live site
 *      instead of localhost.
 *   3. http://localhost:3000        — local development only.
 */
export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
