/**
 * Absolute URL for a file in a *public* Supabase Storage bucket, derived from
 * NEXT_PUBLIC_SUPABASE_URL.
 *
 * Building the URL from the env var (instead of hardcoding the project ref or
 * the `.supabase.co` host) means asset links automatically follow the backend
 * address — e.g. when Supabase is moved behind a custom domain so users on
 * VPNs / filtered networks can reach it. Never hardcode the host at a call site.
 *
 * @param path bucket + object path, e.g. "homepage/homepage video final.mp4"
 */
export function publicStorageUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${encoded}`;
}

/** The landing/sign-in/join background hero clip. */
export const HERO_VIDEO_URL = publicStorageUrl(
  "homepage/homepage video final.mp4",
);
