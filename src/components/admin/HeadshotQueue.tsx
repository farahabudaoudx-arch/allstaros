"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import {
  adminBulkApproveHeadshots,
  adminReviewHeadshot,
} from "@/lib/actions/admin/headshots";

export type QueueRow = {
  id: string;
  full_name: string;
  email: string;
  photo_url: string | null;
  whenLabel: string;
  changed: boolean;
};

const PRESETS = [
  "Not a real headshot",
  "Photo is unclear or low quality",
  "Inappropriate photo",
  "Group shot — needs to be just you",
  "Sunglasses, hat, or logo — not allowed",
] as const;

/**
 * The fast pending queue. Tap a row (or its checkbox) to mark it for approval,
 * or "Select all", then hit Approve once — a single write and one refresh
 * instead of one round-trip per photo. Reject stays per-row because it needs a
 * reason; opening a reason picker doesn't disturb the current selection.
 */
export function HeadshotQueue({ rows }: { rows: QueueRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  }

  return (
    <>
      {/* Select-all header */}
      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs font-medium text-subtle transition hover:text-ink"
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
        <p className="text-xs text-mute">
          Tap a row to mark it, then Approve.
        </p>
      </div>

      {/* Queue — leave room at the bottom so the sticky bar never covers a row */}
      <section className="mt-3 flex flex-col gap-2 pb-24">
        {rows.map((r) => {
          const isSel = selected.has(r.id);
          const isRejecting = rejectingId === r.id;
          return (
            <div
              key={r.id}
              onClick={() => !isRejecting && toggle(r.id)}
              className={`flex cursor-pointer flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5 transition ${
                isSel
                  ? "border-accent/60 ring-1 ring-accent/40"
                  : "border-hairline hover:border-hairline/80"
              }`}
            >
              <div className="flex min-w-0 items-center gap-4">
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => toggle(r.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 w-5 shrink-0 accent-[color:var(--accent,#c8a24a)]"
                  aria-label={`Select ${r.full_name}`}
                />
                <Avatar
                  name={r.full_name}
                  photoUrl={r.photo_url}
                  className="h-14 w-14 text-base ring-1 ring-hairline"
                />
                <div className="min-w-0">
                  <Link
                    href={`/admin/people/${r.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-base font-semibold text-ink hover:text-accent"
                  >
                    {r.full_name}
                  </Link>
                  <p className="mt-0.5 truncate text-sm text-subtle">
                    {r.email}
                  </p>
                  <p className="mt-1 text-xs text-mute">
                    {r.changed ? "Changed" : "Uploaded"} {r.whenLabel}
                    {r.changed ? " · re-review" : ""}
                  </p>
                </div>
              </div>

              {/* Reject lives here; clicks inside must not toggle the row */}
              <div onClick={(e) => e.stopPropagation()}>
                {isRejecting ? (
                  <RejectForm
                    personId={r.id}
                    onCancel={() => setRejectingId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setRejectingId(r.id)}
                    className="rounded-full border border-hairline px-4 py-1.5 text-xs font-medium text-subtle transition hover:border-red-500/50 hover:text-red-400"
                  >
                    Reject
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 ? (
          <p className="text-sm text-mute">Nothing pending right now.</p>
        ) : null}
      </section>

      {/* Sticky approve bar */}
      {selected.size > 0 ? (
        <div className="sticky bottom-4 z-10 mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-card-hi/95 px-5 py-3 shadow-lg backdrop-blur">
          <span className="text-sm font-medium text-ink">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-subtle transition hover:text-ink"
            >
              Clear
            </button>
            <form action={adminBulkApproveHeadshots}>
              {[...selected].map((id) => (
                <input key={id} type="hidden" name="personId" value={id} />
              ))}
              <button
                type="submit"
                className="rounded-full border border-accent/40 bg-accent/10 px-5 py-1.5 text-sm font-semibold text-accent transition hover:bg-accent/20"
              >
                Approve {selected.size}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Reject reason picker for one row (presets or a typed reason). */
function RejectForm({
  personId,
  onCancel,
}: {
  personId: string;
  onCancel: () => void;
}) {
  const [preset, setPreset] = useState<string>(PRESETS[0]);
  const [custom, setCustom] = useState("");
  const reason = custom.trim() || preset;

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
          onClick={onCancel}
          className="rounded-full border border-hairline px-4 py-1.5 text-xs font-medium text-subtle transition hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
