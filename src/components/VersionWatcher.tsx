"use client";

import { useEffect } from "react";

const POLL_MS = 5 * 60 * 1000;

/**
 * Reloads stale tabs after a deploy. There is no service worker, so an open
 * tab keeps running old code until a hard refresh, which makes a just-fixed
 * bug look unfixed. This polls the deployment id from /api/version (every 5
 * minutes, plus whenever the tab becomes visible again) and, once it changes,
 * reloads the page: immediately if the tab is hidden, otherwise the moment it
 * next goes hidden, so a surprise refresh never eats in-progress typing.
 */
export function VersionWatcher() {
  useEffect(() => {
    let initial: string | null = null;
    let stale = false;
    let stopped = false;

    async function fetchSha(): Promise<string | null> {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return null;
        const data = (await res.json()) as { sha?: string };
        return data.sha ?? null;
      } catch {
        // Transport failure (offline, mid-deploy): try again next tick.
        return null;
      }
    }

    async function check() {
      if (stopped || stale) return;
      const sha = await fetchSha();
      if (stopped || !sha || sha === "dev") return;
      if (initial === null) {
        initial = sha;
        return;
      }
      if (sha === initial) return;
      stale = true;
      if (document.visibilityState === "hidden") {
        window.location.reload();
      }
      // Otherwise onVisibility reloads as soon as the tab goes hidden.
    }

    function onVisibility() {
      if (stale && document.visibilityState === "hidden") {
        window.location.reload();
        return;
      }
      if (document.visibilityState === "visible") {
        void check();
      }
    }

    void check();
    const id = setInterval(() => void check(), POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
