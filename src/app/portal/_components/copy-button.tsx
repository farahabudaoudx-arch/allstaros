"use client";

import { useState } from "react";

/**
 * Small inline "copy to clipboard" button. Shows a brief "Copied!" confirmation
 * after a successful copy, then reverts.
 */
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can fail (permissions, insecure context) — fail silently.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${value}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-card-hi px-2.5 py-1.5 text-xs font-medium text-subtle transition hover:border-mute hover:text-ink"
    >
      {copied ? (
        <>
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
            <path
              d="M5 10.5l3.2 3.2L15 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
            <rect
              x="7"
              y="7"
              width="9"
              height="9"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M4 13V4.5A1.5 1.5 0 015.5 3H13"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
