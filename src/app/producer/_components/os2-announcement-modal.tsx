"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { buttonClass } from "@/components/ui";

/**
 * One-time "All Star OS 2.0" announcement popup, shown (via producer/layout) to
 * every builder/producer the first time they land after the redesign ships.
 * Watching is optional: the only control is "Let's go", which marks it seen and
 * never brings it back.
 *
 * "Seen" lives in localStorage rather than the database, so it's per browser and
 * carries no migration. Bump SEEN_KEY for the next announcement instead of
 * reusing this one.
 */
const SEEN_KEY = "allstar:os2-announcement-seen";
const LOOM_EMBED = "https://www.loom.com/embed/c7957397602b4b23b4df47ca88b22c6d";

/** Never changes after mount, so the store needs no real subscription. */
const noop = () => () => {};

function alreadySeen() {
  try {
    return Boolean(window.localStorage.getItem(SEEN_KEY));
  } catch {
    // Private mode / storage blocked: show it, just don't remember.
    return false;
  }
}

export function Os2AnnouncementModal() {
  // False on the server and on the hydrating render, true after, so the server
  // and first client render agree and localStorage is only read client-side.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const visible = mounted && !dismissed && !alreadySeen();

  // Lock background scroll while the modal is up.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  function dismiss() {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Nothing to do; it'll show again next visit in this browser.
    }
    setDismissed(true);
  }

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 md:items-center md:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Plain dim backdrop, same as the other forced popups. */}
          <div className="absolute inset-0 bg-black/80" aria-hidden />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="All Star OS 2.0"
            // `light` scopes just this card to the light palette even though the
            // app runs dark, matching the NPN and headshot popups.
            className="light relative my-8 w-full max-w-2xl rounded-2xl border border-hairline bg-card p-6 md:my-0 md:p-8"
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

            <h2 className="text-center text-2xl font-semibold tracking-[-0.025em] text-ink md:text-3xl">
              All Star OS 2.0
            </h2>
            <p className="mt-3 text-center text-sm leading-relaxed text-subtle md:text-base">
              We&apos;re back, better than ever, with a brand new look. Get a quick
              rundown of our new setup. Watch this video.
            </p>

            <div className="relative mt-6 h-0 w-full overflow-hidden rounded-xl border border-hairline bg-black pb-[64.63%]">
              <iframe
                src={LOOM_EMBED}
                title="All Star OS 2.0 walkthrough"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>

            <button
              type="button"
              onClick={dismiss}
              className={buttonClass("primary", "mt-6 w-full py-3")}
            >
              Let&apos;s go
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
