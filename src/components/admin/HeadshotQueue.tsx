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

// Quick-start messages the admin can drop in and tweak, so a rejection with a
// clear note takes seconds. They're a starting point, not the final text.
const QUICK_NOTES = [
  "This doesn't look like a professional headshot. Please upload a clear, well-lit photo of just your face, looking at the camera, with a plain background.",
  "The photo is a little too dark/blurry to use. Please retake it somewhere well lit and upload it again.",
  "Looks like there's more than one person in this shot. We need a solo photo of just you.",
  "Please lose the sunglasses/hat/logo and upload a clean headshot we can use with clients.",
] as const;

/**
 * The fast pending queue. Tap a row (or its checkbox) to mark it for approval,
 * or "Select all", then hit Approve once — a single write and one refresh
 * instead of one round-trip per photo. Reject stays per-row because it needs a
 * reason; opening a reason picker doesn't disturb the current selection.
 */
export function HeadshotQueue({ rows }: { rows: QueueRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectRow, setRejectRow] = useState<QueueRow | null>(null);

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
          return (
            <div
              key={r.id}
              onClick={() => toggle(r.id)}
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

              {/* Reject opens a modal; the click must not toggle the row */}
              <div onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setRejectRow(r)}
                  className="rounded-full border border-hairline px-4 py-1.5 text-xs font-medium text-subtle transition hover:border-red-500/50 hover:text-red-400"
                >
                  Reject
                </button>
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

      {/* Reject modal: their photo + the message you'll email them */}
      {rejectRow ? (
        <RejectModal row={rejectRow} onClose={() => setRejectRow(null)} />
      ) : null}
    </>
  );
}

/**
 * The reject popup. Shows the person's actual uploaded photo so you can see what
 * you're rejecting, and a message box for what they need to do differently.
 * Submitting marks the photo rejected, saves your message (they see it on their
 * wall), and emails it to them with a link back to Settings to re-upload.
 */
function RejectModal({
  row,
  onClose,
}: {
  row: QueueRow;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const canSend = message.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm md:p-8"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-lg rounded-2xl border border-hairline bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          {row.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.photo_url}
              alt={row.full_name}
              className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-hairline"
            />
          ) : (
            <Avatar
              name={row.full_name}
              photoUrl={null}
              className="h-20 w-20 rounded-xl text-2xl ring-1 ring-hairline"
            />
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">{row.full_name}</h2>
            <p className="truncate text-sm text-subtle">{row.email}</p>
          </div>
        </div>

        <form action={adminReviewHeadshot} className="mt-5">
          <input type="hidden" name="personId" value={row.id} />
          <input type="hidden" name="decision" value="reject" />

          <label className="block text-sm font-medium text-ink">
            What should they do differently?
          </label>
          <p className="mt-1 text-xs text-mute">
            This gets emailed to {row.email} and shown on their upload screen.
          </p>
          <textarea
            name="reason"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            autoFocus
            placeholder="e.g. Please upload a clear, well-lit photo of just your face with a plain background — no sunglasses or hats."
            className="mt-2 w-full rounded-xl border border-hairline bg-card-hi px-3 py-2.5 text-sm text-ink placeholder:text-mute focus:border-accent/50 focus:outline-none"
          />

          <div className="mt-3">
            <p className="text-xs text-mute">Quick start:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_NOTES.map((note, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setMessage(note)}
                  className="rounded-full border border-hairline px-3 py-1.5 text-left text-xs text-subtle transition hover:border-accent/40 hover:text-ink"
                >
                  {note.split(".")[0]}.
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-hairline px-4 py-2 text-sm font-medium text-subtle transition hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSend}
              className="rounded-full border border-red-500/40 bg-red-500/10 px-5 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reject &amp; email
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
