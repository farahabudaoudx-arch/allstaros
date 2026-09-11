"use client";

import { useEffect, useMemo, useState } from "react";
import { LiveCastControls } from "@/components/producer/leaderboard/LiveCastControls";

export type LiveLeaderboardScope = "team" | "organization";

type Capability = {
  id: string;
  creator_person_id: string;
  scope: LiveLeaderboardScope;
  created_at: string;
  revoked_at: string | null;
  rotated_from_id: string | null;
};

type CurrentLink = { capabilityId: string; url: string };

type CapabilitiesResponse =
  | { ok: true; capabilities: Capability[] }
  | { ok: false; error?: string };

type MutationResponse =
  | { ok: true; capability?: Capability; url?: string }
  | { ok: false; error?: string };

const ENDPOINT = "/api/producer/live-leaderboard/capabilities";

async function readCapabilities(signal?: AbortSignal): Promise<Capability[]> {
  const response = await fetch(ENDPOINT, { cache: "no-store", signal });
  const body = (await response.json()) as CapabilitiesResponse;
  if (!response.ok || !body.ok) {
    throw new Error(body.ok ? "Unable to load Live links." : body.error ?? "Unable to load Live links.");
  }
  return body.capabilities;
}

async function mutateCapability(body: Record<string, string>): Promise<MutationResponse & { ok: true }> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as MutationResponse;
  if (!response.ok || !payload.ok) {
    throw new Error("Unable to update the Live link. Try again.");
  }
  return payload;
}

function scopeLabel(scope: LiveLeaderboardScope) {
  return scope === "team" ? "Team" : "Organization";
}

function createdLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Created recently";
  return "Created " + date.toLocaleString();
}

export function LiveLeaderboardSheet({
  open,
  onClose,
  defaultScope,
}: {
  open: boolean;
  onClose: () => void;
  defaultScope: LiveLeaderboardScope;
}) {
  const [scope, setScope] = useState<LiveLeaderboardScope>(defaultScope);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [linksByScope, setLinksByScope] = useState<Partial<Record<LiveLeaderboardScope, CurrentLink>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void readCapabilities(controller.signal)
      .then((rows) => {
        setCapabilities(rows);
        setLoadError(null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "Unable to load Live links.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const activeForScope = useMemo(
    () => capabilities.filter((item) => item.scope === scope && !item.revoked_at),
    [capabilities, scope],
  );
  const currentLink = linksByScope[scope] ?? null;

  async function retryLoad() {
    setLoading(true);
    setLoadError(null);
    try {
      setCapabilities(await readCapabilities());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load Live links.");
    } finally {
      setLoading(false);
    }
  }

  function selectScope(nextScope: LiveLeaderboardScope) {
    setScope(nextScope);
    setFeedback(null);
  }

  async function createLink(requestedScope: LiveLeaderboardScope) {
    setBusy("mint-" + requestedScope);
    setFeedback(null);
    try {
      const result = await mutateCapability({ action: "mint", scope: requestedScope });
      if (!result.capability || !result.url) throw new Error("The Live link was created without a usable URL.");
      setCapabilities((items) => [result.capability!, ...items]);
      setLinksByScope((links) => ({
        ...links,
        [requestedScope]: { capabilityId: result.capability!.id, url: result.url! },
      }));
      setFeedback({ kind: "success", message: scopeLabel(requestedScope) + " link created." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Unable to create the Live link. Try again." });
    } finally {
      setBusy(null);
    }
  }

  async function revokeLink(capabilityId: string, capabilityScope: LiveLeaderboardScope) {
    setBusy("revoke-" + capabilityId);
    setFeedback(null);
    try {
      await mutateCapability({ action: "revoke", capabilityId });
      setCapabilities((items) => items.filter((item) => item.id !== capabilityId));
      setLinksByScope((links) => {
        if (links[capabilityScope]?.capabilityId !== capabilityId) return links;
        const next = { ...links };
        delete next[capabilityScope];
        return next;
      });
      setFeedback({ kind: "success", message: "Link revoked. Displays using it will need a new link." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Unable to revoke the link. Try again." });
    } finally {
      setBusy(null);
    }
  }

  async function rotateLink(capabilityId: string, capabilityScope: LiveLeaderboardScope) {
    setBusy("rotate-" + capabilityId);
    setFeedback(null);
    try {
      const result = await mutateCapability({ action: "rotate", capabilityId });
      if (!result.capability || !result.url) throw new Error("The replacement link did not return a usable URL.");
      setCapabilities((items) => [result.capability!, ...items.filter((item) => item.id !== capabilityId)]);
      setLinksByScope((links) => ({
        ...links,
        [capabilityScope]: { capabilityId: result.capability!.id, url: result.url! },
      }));
      setFeedback({ kind: "success", message: "Link rotated. The old URL no longer works." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Unable to rotate the link. Try again." });
    } finally {
      setBusy(null);
    }
  }

  async function copyCurrentLink() {
    if (!currentLink) return;
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(currentLink.url);
      setFeedback({ kind: "success", message: "Live link copied." });
    } catch {
      setFeedback({ kind: "error", message: "Copy failed. Select the URL below and copy it manually." });
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="live-leaderboard-title">
      <button type="button" aria-label="Close Live Leaderboard" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-hairline bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-5 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Live Leaderboard</p>
            <h2 id="live-leaderboard-title" className="mt-1 text-2xl font-semibold text-ink">Put today on the big screen</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-subtle">Create a view-only link for a TV browser, then copy or preview the exact board.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Live Leaderboard" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline text-lg text-subtle transition hover:border-mute hover:text-ink">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="rounded-2xl border border-hairline bg-card-hi/40 p-1">
            <div className="grid grid-cols-2 gap-1">
              {(["team", "organization"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectScope(option)}
                  aria-pressed={scope === option}
                  className={"rounded-xl px-4 py-3 text-sm font-semibold transition " + (scope === option ? "bg-accent text-black" : "text-subtle hover:bg-card hover:text-ink")}
                >
                  {scopeLabel(option)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-hairline bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ink">{scopeLabel(scope)} board</p>
                <p className="mt-1 text-xs leading-5 text-subtle">{scope === "team" ? "You plus your current downline." : "Everyone included by the normal All Star Leaderboard."}</p>
              </div>
              <span className="rounded-full border border-accent/30 bg-accent/[0.08] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Selected</span>
            </div>

            {currentLink ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-subtle" htmlFor="live-link-url">Current URL</label>
                <input id="live-link-url" readOnly value={currentLink.url} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-xl border border-hairline bg-bg px-3 py-2.5 text-xs text-ink outline-none focus:border-accent/60" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => void copyCurrentLink()} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105">Copy link</button>
                  <a href={currentLink.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-hairline bg-card-hi px-4 py-2.5 text-center text-sm font-semibold text-ink transition hover:border-mute">Preview</a>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void createLink(scope)}
                className="mt-4 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "mint-" + scope ? "Creating…" : "Create " + scopeLabel(scope) + " link"}
              </button>
            )}
          </div>

          <LiveCastControls
            liveUrl={currentLink?.url ?? null}
            scopeLabel={scopeLabel(scope)}
            variant="sheet"
          />

          {feedback ? (
            <div role="status" className={"mt-4 rounded-xl border px-4 py-3 text-sm " + (feedback.kind === "success" ? "border-accent/30 bg-accent/[0.06] text-ink" : "border-neg/30 bg-neg/[0.06] text-neg")}>{feedback.message}</div>
          ) : null}

          <div className="mt-5 rounded-2xl border border-hairline bg-card p-5">
            <p className="text-sm font-semibold text-ink">Link access</p>
            <p className="mt-2 text-sm leading-6 text-subtle">Anyone with this link can see this board’s live numbers.</p>
            <p className="mt-2 text-sm leading-6 text-subtle">On a TV browser, use OK/click once to enable the gong when browser audio becomes available.</p>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Active {scopeLabel(scope)} links</p>
                <p className="mt-1 text-xs text-subtle">Existing secrets are never stored in readable form. Rotate an older link to receive a new URL.</p>
              </div>
              <button type="button" onClick={() => void retryLoad()} disabled={loading} className="text-xs font-semibold text-accent disabled:opacity-50">{loading ? "Loading…" : "Refresh"}</button>
            </div>

            {loadError ? (
              <div className="mt-3 rounded-xl border border-neg/30 bg-neg/[0.06] p-4 text-sm text-neg">
                <p>{loadError}</p>
                <button type="button" onClick={() => void retryLoad()} className="mt-2 font-semibold underline underline-offset-4">Try again</button>
              </div>
            ) : loading ? (
              <div className="mt-3 rounded-xl border border-hairline bg-card p-4 text-sm text-mute">Loading Live links…</div>
            ) : activeForScope.length === 0 ? (
              <div className="mt-3 rounded-xl border border-hairline bg-card p-4 text-sm text-mute">No active {scopeLabel(scope).toLowerCase()} links yet.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {activeForScope.map((item) => {
                  const isCurrent = currentLink?.capabilityId === item.id;
                  return (
                    <div key={item.id} className="rounded-xl border border-hairline bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-ink">{isCurrent ? "Current browser link" : "Active link"}</p>
                          <p className="mt-1 text-xs text-mute">{createdLabel(item.created_at)}</p>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" disabled={busy !== null} onClick={() => void rotateLink(item.id, item.scope)} className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-mute disabled:opacity-50">{busy === "rotate-" + item.id ? "Rotating…" : "Rotate"}</button>
                          <button type="button" disabled={busy !== null} onClick={() => void revokeLink(item.id, item.scope)} className="rounded-lg border border-neg/30 px-3 py-1.5 text-xs font-semibold text-neg transition hover:bg-neg/[0.06] disabled:opacity-50">{busy === "revoke-" + item.id ? "Revoking…" : "Revoke"}</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
