"use client";

import { useState } from "react";

/**
 * A button that opens a popup containing `children` (usually a form). When the
 * form submits, the server action redirects and the page reloads, so the popup
 * closes naturally.
 */
export function Modal({
  label,
  title,
  variant = "primary",
  children,
}: {
  label: string;
  title?: string;
  variant?: "primary" | "ghost";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const trigger =
    variant === "primary"
      ? "rounded-full bg-accent px-5 py-2 text-xs font-semibold text-black transition hover:opacity-90"
      : "rounded-full border border-hairline px-5 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger}>
        {label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-ink">{title ?? label}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full px-2 text-lg text-mute transition hover:text-ink"
              >
                ×
              </button>
            </div>
            <div className="mt-4">{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
