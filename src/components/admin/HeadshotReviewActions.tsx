"use client";

import { useState } from "react";
import { adminReviewHeadshot } from "@/lib/actions/admin/headshots";

const PRESETS = [
  "Not a real headshot",
  "Photo is unclear or low quality",
  "Inappropriate photo",
  "Group shot — needs to be just you",
  "Sunglasses, hat, or logo — not allowed",
] as const;

/**
 * The two decisions on one queued photo. Approve is a one-click form. Reject
 * opens a reason picker (presets or a typed reason) so the person gets a clear
 * message on the wall. Both route through the single guarded server action.
 */
export function HeadshotReviewActions({ personId }: { personId: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [preset, setPreset] = useState<string>(PRESETS[0]);
  const [custom, setCustom] = useState("");

  const reason = custom.trim() || preset;

  if (!rejecting) {
    return (
      <div className="flex items-center gap-2">
        <form action={adminReviewHeadshot}>
          <input type="hidden" name="personId" value={personId} />
          <input type="hidden" name="decision" value="approve" />
          <button
            type="submit"
            className="rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
          >
            Approve
          </button>
        </form>
        <button
          type="button"
          onClick={() => setRejecting(true)}
          className="rounded-full border border-hairline px-4 py-1.5 text-xs font-medium text-subtle transition hover:border-red-500/50 hover:text-red-400"
        >
          Reject
        </button>
      </div>
    );
  }

  return (
    <form
      action={adminReviewHeadshot}
      className="flex w-full flex-col gap-2 sm:w-72"
    >
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="decision" value="reject" />
      <input type="hidden" name="reason" value={reason} />
      <select
        value={preset}
        onChange={(e) => setPreset(e.target.value)}
        className="rounded-lg border border-hairline bg-card px-3 py-2 text-xs text-ink"
      >
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        placeholder="Or type a specific reason…"
        className="rounded-lg border border-hairline bg-card px-3 py-2 text-xs text-ink placeholder:text-mute"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-full border border-red-500/40 bg-red-500/10 px-4 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
        >
          Confirm reject
        </button>
        <button
          type="button"
          onClick={() => setRejecting(false)}
          className="rounded-full border border-hairline px-4 py-1.5 text-xs font-medium text-subtle transition hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
