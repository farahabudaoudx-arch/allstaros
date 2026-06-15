"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui";

/**
 * A submit button wired to its parent <form>'s pending state. The moment the
 * form's server action fires, it disables itself and swaps in a spinner — so the
 * round-trip reads as "working" instead of a dead, unresponsive button (and the
 * disable also blocks accidental double-submits).
 *
 * Drop it in place of a plain <button type="submit"> inside any server-action
 * <form>; pass the same className you'd give that button.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  /** Optional label shown next to the spinner while pending (defaults to children). */
  pendingLabel?: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
