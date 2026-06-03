"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Celebration overlay shown the first time the recruit reaches the unlocked
 * state (finished the Xcel study-login step). Blurs the screen behind a card
 * that points (via a left-side triangle) toward the newly-unlocked sidebar nav.
 *
 * Visibility is driven entirely by the recruit's real progress (`unlocked`), NOT
 * a URL flag — so it can't be triggered by someone typing a query string, and a
 * plain refresh won't replay it. A per-recruit "seen" marker in localStorage
 * keeps it to a single showing; it's cleared automatically whenever the recruit
 * is back below the unlock point (e.g. the demo "Reset to step 1"), so the demo
 * flow can replay the moment cleanly.
 */
export function UnlockCelebration({
  recruitId,
  unlocked,
}: {
  recruitId: string;
  /** True once the recruit has reached the studying step in licensing. */
  unlocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const seenKey = `allstar:unlock-celebrated:${recruitId}`;

  // localStorage is client-only, so this has to run after mount. Reading the
  // "seen" marker here (rather than in a useState initializer) keeps server and
  // client renders identical and avoids a hydration mismatch.
  useEffect(() => {
    if (!unlocked) {
      // Below the unlock point — clear the marker so a future unlock (or a demo
      // replay) shows the celebration again.
      window.localStorage.removeItem(seenKey);
      return;
    }
    if (window.localStorage.getItem(seenKey)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time reveal gated on client-only storage; no SSR-safe alternative
    setOpen(true);
  }, [unlocked, seenKey]);

  function close() {
    window.localStorage.setItem(seenKey, "1");
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5 backdrop-blur-md"
          onClick={close}
        >
          <motion.div
            initial={{ scale: 0.94, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl border border-accent/40 bg-card p-7 shadow-2xl md:p-8"
          >
            {/* Left-side pointer triangle */}
            <span
              aria-hidden
              className="absolute -left-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 rotate-45 rounded-sm border-b border-l border-accent/40 bg-card md:block"
            />

            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              {"// Unlocked"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-ink">
              Great Job Taking The First Steps!
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-subtle">
              The full All Star Recruit onboarding platform has been unlocked for
              you.
            </p>

            <button
              type="button"
              onClick={close}
              className="mt-6 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-black transition hover:brightness-95"
            >
              Let&apos;s go
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
