"use client";

import { useCallback, useEffect, useState } from "react";

export function ProfileSettingsForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/producer/profile", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      setFullName(json.profile?.full_name ?? "");
      setEmail(json.profile?.email ?? "");
      setPhone(json.profile?.phone ?? "");
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
        body: JSON.stringify({ full_name: fullName, email, phone }),
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

  if (loading) return <p className="mt-6 text-sm text-mute">Loading…</p>;

  return (
    <form onSubmit={submit} className="mt-6 max-w-xl space-y-4">
      <label className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">Name</span>
        <span className="block text-xs text-mute">
          The name on your account.
        </span>
        <input
          type="text"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            setSaved(false);
          }}
          placeholder="Your full name"
          className="mt-3 w-full bg-transparent text-lg font-medium text-ink outline-none placeholder:text-mute"
        />
      </label>

      <label className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">Email</span>
        <span className="block text-xs text-mute">
          The email you sign in with.
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSaved(false);
          }}
          placeholder="you@example.com"
          className="mt-3 w-full bg-transparent text-lg font-medium text-ink outline-none placeholder:text-mute"
        />
      </label>

      <label className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">Phone</span>
        <span className="block text-xs text-mute">
          Your account phone number. Optional.
        </span>
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setSaved(false);
          }}
          placeholder="555-555-5555"
          className="mt-3 w-full bg-transparent text-lg font-medium tabular-nums text-ink outline-none placeholder:text-mute"
        />
      </label>

      {error && <p className="text-sm text-neg">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background transition hover:bg-accent-soft disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save details"}
        </button>
        {saved && <span className="text-sm text-pos">Saved.</span>}
      </div>
    </form>
  );
}
