"use client";

import { useState } from "react";
import type { NpnStatus } from "@/lib/db/types";
import { saveNpn } from "@/lib/actions/npn";

/**
 * Add or correct your NPN from Settings. Mirrors the popup's rules: the number
 * saves as "submitted" (pending an admin verify) and a verified number is
 * locked here. Current status is shown so the producer knows where they stand.
 */
export function NpnSettingsForm({
  initialNpn,
  status,
}: {
  initialNpn: string;
  status: NpnStatus;
}) {
  const [npn, setNpn] = useState(initialNpn);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verified = status === "verified";

  const note =
    status === "verified"
      ? "Verified and on file."
      : status === "submitted"
        ? "On file, pending verification."
        : status === "pending_license"
          ? "You told us you don't have one yet. Add it here once you're licensed."
          : "We don't have your NPN yet. Add it below.";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await saveNpn(npn);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
  }

  return (
    <form onSubmit={submit} className="mt-6 max-w-xl space-y-4">
      <label className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">
          National Producer Number (NPN)
        </span>
        <span className="block text-xs text-mute">{note}</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={10}
          disabled={verified}
          value={npn}
          onChange={(e) => {
            setNpn(e.target.value.replace(/\D/g, "").slice(0, 10));
            setSaved(false);
            if (error) setError(null);
          }}
          placeholder="e.g. 20841537"
          className="mt-3 w-full bg-transparent text-lg font-medium tracking-[0.04em] text-ink outline-none placeholder:text-mute disabled:opacity-60"
        />
      </label>

      {error && <p className="text-sm text-neg">{error}</p>}

      {!verified && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background transition hover:bg-accent-soft disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save NPN"}
          </button>
          {saved && <span className="text-sm text-pos">Saved.</span>}
        </div>
      )}
    </form>
  );
}
