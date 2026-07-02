"use client";

import { useCallback, useEffect, useState } from "react";

export function BuilderSettingsForm() {
  const [adminEmail, setAdminEmail] = useState("");
  const [xcelCode, setXcelCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [uplineName, setUplineName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/producer/profile", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      setAdminEmail(json.profile?.admin_email ?? "");
      setXcelCode(json.profile?.xcel_code ?? "");
      setInviteCode(json.profile?.invite_code ?? "");
      setUplineName(json.profile?.upline_name ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/producer/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          admin_email: adminEmail,
          xcel_code: xcelCode,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to save");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable, ignore */
    }
  };

  if (loading) return <p className="mt-6 text-sm text-mute">Loading…</p>;

  return (
    <form onSubmit={submit} className="mt-6 max-w-xl space-y-4">
      {/* Upline. Read-only, informational. */}
      <div className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">Your upline</span>
        <span className="block text-xs text-mute">Who you report to. Locked.</span>
        <p className="mt-3 text-lg font-medium text-ink">{uplineName || "Not set"}</p>
      </div>

      {/* Invite code. Read-only, locked. */}
      <div className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">Invite code</span>
        <span className="block text-xs text-mute">
          Your personal recruiting code. Locked. Recruits who sign up with it land on your team.
        </span>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="text"
            value={inviteCode || "Not set"}
            readOnly
            aria-readonly="true"
            tabIndex={-1}
            className="w-full cursor-not-allowed bg-transparent font-mono text-lg font-medium tracking-[0.12em] text-mute outline-none"
          />
          <button
            type="button"
            onClick={copyInvite}
            disabled={!inviteCode}
            className="shrink-0 rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink transition hover:border-mute disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <label className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">Admin email</span>
        <span className="block text-xs text-mute">
          Your admin email, where recruits send their contracting info.
        </span>
        <input
          type="email"
          value={adminEmail}
          onChange={(e) => {
            setAdminEmail(e.target.value);
            setSaved(false);
          }}
          placeholder="admin@example.com"
          className="mt-3 w-full bg-transparent text-lg font-medium text-ink outline-none placeholder:text-mute"
        />
      </label>

      <label className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">Xcel Solutions code</span>
        <span className="block text-xs text-mute">Your Xcel Solutions code.</span>
        <input
          type="text"
          value={xcelCode}
          onChange={(e) => {
            setXcelCode(e.target.value);
            setSaved(false);
          }}
          placeholder="Your code"
          className="mt-3 w-full bg-transparent text-lg font-medium text-ink outline-none placeholder:text-mute"
        />
      </label>

      {error && <p className="text-sm text-neg">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background transition hover:bg-accent-soft disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save builder details"}
        </button>
        {saved && <span className="text-sm text-pos">Saved.</span>}
      </div>
    </form>
  );
}
