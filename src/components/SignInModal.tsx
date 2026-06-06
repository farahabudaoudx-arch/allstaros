"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import SignInButton from "@/app/auth/signin/signin-button";

/**
 * Landing-page sign-in. Instead of navigating to /auth/signin, the magic-link
 * form animates in as a modal over the hero. Reuses the same SignInButton form
 * the dedicated page uses, so there's one source of truth for auth.
 */
export function SignInModal({
  next = "/",
  devLogin = false,
}: {
  next?: string;
  devLogin?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass("primary", "px-7 py-3 text-base")}
      >
        Sign In
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Backdrop */}
            <button
              type="button"
              aria-label="Close sign in"
              onClick={() => setOpen(false)}
              className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
            />

            {/* Dialog */}
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Sign in"
              className="relative w-full max-w-md rounded-2xl border border-hairline bg-card p-10 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.22 }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-mute transition hover:bg-card-hi hover:text-ink"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M5 5l10 10M15 5L5 15"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              <div className="mb-8 text-center">
                <Image
                  src="/logo.png"
                  alt="All Star Life Group"
                  width={140}
                  height={79}
                  className="app-logo mx-auto h-10 w-auto"
                />
                <h2 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">
                  Sign in to continue
                </h2>
                <p className="mt-3 text-sm text-subtle">
                  Enter the email your upline has on file. We&apos;ll send a
                  sign-in link.
                </p>
              </div>

              <SignInButton next={next} />

              <p className="mt-6 text-center text-xs text-mute">
                By signing in you agree to be tracked through the pipeline.
              </p>

              {devLogin ? (
                <p className="mt-4 text-center text-xs text-mute">
                  <Link href="/auth/dev" className="underline hover:text-accent">
                    Dev sign-in
                  </Link>
                </p>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
