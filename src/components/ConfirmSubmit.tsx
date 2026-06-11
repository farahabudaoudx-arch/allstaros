"use client";

import { useRef, useState } from "react";

/**
 * A destructive submit button that pops a confirmation dialog before actually
 * submitting its parent <form> (a server action). Drop it in place of a plain
 * <button type="submit"> inside a server-action form.
 */
export function ConfirmSubmit({
  label,
  title,
  message,
  confirmLabel = "Yes, remove them",
  cancelLabel = "Cancel",
  className = "",
}: {
  label: string;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function confirm() {
    setOpen(false);
    triggerRef.current?.closest("form")?.requestSubmit();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={className}
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            <p className="mt-2 text-sm text-subtle">{message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink transition hover:border-mute"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={confirm}
                className="rounded-full bg-neg px-4 py-2 text-sm font-semibold text-white transition hover:bg-neg/85"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
