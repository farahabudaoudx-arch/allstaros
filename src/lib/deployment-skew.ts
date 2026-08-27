/** Live deployment id from the running server (`/api/version`). */
export async function fetchLiveDeploymentId(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { sha?: string };
    const sha = data.sha?.trim();
    if (!sha || sha === "dev") return null;
    return sha;
  } catch {
    return null;
  }
}

/** Deployment id baked into this HTML document by Next (`deploymentId` config). */
export function pageDeploymentId(): string | null {
  if (typeof document === "undefined") return null;
  const id = document.documentElement.getAttribute("data-dpl-id")?.trim();
  if (!id || id === "local-dev") return null;
  return id;
}

/** True when the open page belongs to an older deployment than the live server. */
export async function isDeploymentStale(): Promise<boolean> {
  const live = await fetchLiveDeploymentId();
  const page = pageDeploymentId();
  if (!live || !page) return false;
  return live !== page;
}
