"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/**
 * Submit button wired to the parent <form>'s pending state. The moment it's
 * clicked it disables itself and swaps in a spinner, so server-action
 * round-trips read as "working" instead of a frozen, unresponsive button.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: Variant;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={buttonClass(variant, className)}
    >
      {pending ? (
        <>
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
