"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Celebration overlay shown the moment the recruit finishes the Xcel signup step
 * and the rest of the platform unlocks. Blurs the screen behind a card that
 * points (via a left-side triangle) toward the newly-unlocked sidebar nav.
 * Closing strips the ?unlocked=1 flag so a refresh doesn't show it again.
 */
export function UnlockCelebration({ show }: { show: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(show);

  function close() {
    setOpen(false);
    // Drop the query flag so the overlay doesn't reappear on refresh.
    router.replace("/portal");
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
