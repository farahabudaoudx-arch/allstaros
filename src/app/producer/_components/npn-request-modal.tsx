"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { buttonClass } from "@/components/ui";
import { submitNpn, declineNpn } from "@/lib/actions/npn";

type View = "form" | "done" | "noNpn";

/**
 * NPN request popup. Shown (via producer/layout) only to active producers/builders
 * whose npn_status is still "missing". It is deliberately forced (no close/X, no
 * Escape, no backdrop dismiss) because both answers are one click and both flip
 * npn_status off "missing", so it never returns once handled. All writes go through
 * the submitNpn/declineNpn server actions.
 */
export function NpnRequestModal({ initialOpen }: { initialOpen: boolean }) {
  const [visible, setVisible] = useState(initialOpen);
  const [view, setView] = useState<View>("form");
  const [npn, setNpn] = useState("");
  const [savedNpn, setSavedNpn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Lock background scroll while the modal is up.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  // People who don't need it never render the modal at all.
  if (!initialOpen) return null;

  async function handleSubmit() {
    const digits = npn.replace(/\D/g, "");
    if (!digits) {
      setError("Please enter your NPN to continue.");
      return;
    }
    setError(null);
    setPending(true);
    const res = await submitNpn(digits);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSavedNpn(digits);
    setView("done");
  }

  async function handleDecline() {
    setError(null);
    setPending(true);
    const res = await declineNpn();
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Plain dim backdrop. No blur, not dismissable. */}
          <div className="absolute inset-0 bg-black/80" aria-hidden />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="NPN request"
            // `light` scopes just this card to the white/light palette (the design's
            // look) even though the app runs dark. Descendant tokens (bg-card, text-ink,
            // border-hairline) and the logo invert follow via the cascade.
            className="light relative w-full max-w-md rounded-2xl border border-hairline bg-card p-8"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
          >
            <Image
              src="/logo.png"
              alt="All Star Life Group"
              width={140}
              height={79}
              className="app-logo mx-auto mb-6 h-8 w-auto"
            />

            {/* Success */}
            {view === "done" ? (
              <div className="flex flex-col items-center text-center">
                <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-pos/40 bg-pos/10">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-pos"
                    aria-hidden
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">
                  You&apos;re all set
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-subtle">
                  Thanks, we&apos;ll start issuing your IP reports inside the platform.
                </p>
                <p className="mt-2 text-sm text-subtle">
                  NPN{" "}
                  <span className="text-ink">{savedNpn}</span> is now on file.
                </p>
                <button
                  type="button"
                  onClick={() => setVisible(false)}
                  className={buttonClass("primary", "mt-6 w-full py-3")}
                >
                  Continue
                </button>
              </div>
            ) : null}

            {/* Ask for the NPN */}
            {view === "form" ? (
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.025em] text-ink">
                  Hello! A small request&hellip;
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-subtle">
                  Could you please provide your NPN below so we can start issuing IP
                  reports inside the platform for you?
                </p>

                <div className="mt-6 flex flex-col gap-1.5">
                  <label htmlFor="npn-input" className="text-sm font-medium text-ink">
                    National Producer Number
                  </label>
                  <input
                    id="npn-input"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={10}
                    placeholder="e.g. 20841537"
                    value={npn}
                    onChange={(e) => {
                      setNpn(e.target.value.replace(/\D/g, "").slice(0, 10));
                      if (error) setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSubmit();
                    }}
                    className={`w-full rounded-lg border bg-card-hi px-3 py-2.5 text-base tracking-[0.04em] text-ink outline-none transition ${
                      error ? "border-neg" : "border-hairline focus:border-accent"
                    }`}
                  />
                  {error ? <span className="text-xs text-neg">{error}</span> : null}
                </div>

                <div className="mt-5 flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={pending}
                    className={buttonClass("primary", "w-full py-3")}
                  >
                    {pending ? "Saving…" : "Submit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setView("noNpn");
                    }}
                    disabled={pending}
                    className={buttonClass("danger", "w-full py-3")}
                  >
                    I do not have an NPN yet
                  </button>
                </div>
              </div>
            ) : null}

            {/* They don't have one yet */}
            {view === "noNpn" ? (
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">
                  No problem
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-subtle">
                  You&apos;ll get your NPN once you&apos;re licensed. We&apos;ll hold off
                  on IP reports until then. You can add it anytime from the Settings tab.
                </p>
                {error ? <p className="mt-3 text-xs text-neg">{error}</p> : null}
                <div className="mt-5 flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={handleDecline}
                    disabled={pending}
                    className={buttonClass("primary", "w-full py-3")}
                  >
                    {pending ? "Saving…" : "Continue"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("form")}
                    disabled={pending}
                    className={buttonClass("secondary", "w-full py-3")}
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
