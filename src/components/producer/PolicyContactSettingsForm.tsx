"use client";

import { useCallback, useEffect, useState } from "react";

// The contact details that print on the client policy summary, under "Your
// Client Coverage Specialist." Separate from the login account — blank fields
// fall back to the account name/email/phone (shown as the placeholder).
export function PolicyContactSettingsForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
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
      setName(json.profile?.policy_contact_name ?? "");
      setEmail(json.profile?.policy_contact_email ?? "");
      setPhone(json.profile?.policy_contact_phone ?? "");
      setAccountName(json.profile?.full_name ?? "");
      setAccountEmail(json.profile?.email ?? "");
      setAccountPhone(json.profile?.phone ?? "");
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
          policy_contact_name: name,
          policy_contact_email: email,
          policy_contact_phone: phone,
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

  if (loading) return <p className="mt-6 text-sm text-mute">Loading…</p>;

  return (
    <form onSubmit={submit} className="mt-6 max-w-xl space-y-4">
      <label className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">Name</span>
        <span className="block text-xs text-mute">
          Shown to clients on the policy summary. Leave blank to use your account name.
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setSaved(false); }}
          placeholder={accountName || "Your full name"}
          className="mt-3 w-full bg-transparent text-lg font-medium text-ink outline-none placeholder:text-mute"
        />
      </label>

      <label className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">Email</span>
        <span className="block text-xs text-mute">
          Contact email clients see on the policy summary. Leave blank to use your account email.
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setSaved(false); }}
          placeholder={accountEmail || "you@example.com"}
          className="mt-3 w-full bg-transparent text-lg font-medium text-ink outline-none placeholder:text-mute"
        />
      </label>

      <label className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">Phone</span>
        <span className="block text-xs text-mute">
          Callback number clients see on the policy summary — can be an admin&apos;s line. Leave
          blank to use your account phone.
        </span>
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setSaved(false); }}
          placeholder={accountPhone || "555-555-5555"}
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
          {saving ? "Saving…" : "Save policy info"}
        </button>
        {saved && <span className="text-sm text-pos">Saved.</span>}
      </div>
    </form>
  );
}
