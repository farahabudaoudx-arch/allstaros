"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { reportBug } from "@/lib/actions/report-bug";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * "Report a bug" trigger + modal, lives in the sidebar footer next to Sign out.
 * Lets anyone describe a problem and optionally attach a screenshot; the report
 * is emailed to the bug inbox (see reportBug / BUG_REPORT_TO) with reply-to set
 * to the reporter. Mirrors SignInModal's framer-motion modal pattern.
 */
export function BugReportModal({ collapsed }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The sidebar this lives in is `position: sticky`, which creates its own
  // stacking context — so a `fixed` overlay rendered here gets trapped below the
  // main page content (page avatars etc. paint over it). Portal the overlay to
  // <body> so it escapes that context and sits above everything.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Lock scroll + close on Escape while open (same as SignInModal).
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

  function close() {
    setOpen(false);
    // Reset after the exit animation so the form is fresh next time.
    setTimeout(() => {
      setStatus("idle");
      setError(null);
      setFileName(null);
    }, 250);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const form = new FormData(e.currentTarget);
    form.set("pageUrl", window.location.href);
    form.set("userAgent", navigator.userAgent);

    const res = await reportBug(form);
    if (res.ok) {
      setStatus("sent");
    } else {
      setStatus("error");
      setError(res.error);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={collapsed ? "Report a bug" : undefined}
        className={
          collapsed
            ? "flex w-full items-center justify-center rounded-full border border-hairline px-2 py-2 text-ink transition hover:border-accent hover:text-accent"
            : "flex w-full items-center justify-center gap-2 rounded-full border border-hairline px-3.5 py-2 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
        }
      >
        <BugIcon />
        {!collapsed ? "Report a bug" : null}
      </button>

      {mounted
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
            {/* Backdrop */}
            <button
              type="button"
              aria-label="Close bug report"
              onClick={close}
              className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
            />

            {/* Dialog */}
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Report a bug"
              className="relative w-full max-w-md rounded-2xl border border-hairline bg-card p-8 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.22 }}
            >
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-mute transition hover:bg-card-hi hover:text-ink"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
                  <path
                    d="M5 5l10 10M15 5L5 15"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {status === "sent" ? (
                <div className="py-6 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card-hi text-accent ring-1 ring-hairline">
                    <svg viewBox="0 0 20 20" className="h-6 w-6" fill="none" aria-hidden>
                      <path
                        d="M5 10.5l3.2 3.2L15 7"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em]">
                    Report sent
                  </h2>
                  <p className="mt-2 text-sm text-subtle">
                    Thanks for flagging it — we&apos;ll take a look. You&apos;ll
                    hear back at your email if we need more.
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-6 w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-black transition hover:opacity-90"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold tracking-[-0.02em]">
                      Report a bug
                    </h2>
                    <p className="mt-2 text-sm text-subtle">
                      Tell us what went wrong and attach a screenshot if you have
                      one.
                    </p>
                  </div>

                  <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <textarea
                      name="message"
                      required
                      rows={5}
                      autoFocus
                      placeholder="What happened? What were you trying to do?"
                      className="w-full resize-y rounded-xl border border-hairline bg-background px-3.5 py-3 text-sm text-ink placeholder:text-mute focus:border-accent focus:outline-none"
                    />

                    <div>
                      <input
                        ref={fileRef}
                        type="file"
                        name="screenshot"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        onChange={(e) =>
                          setFileName(e.target.files?.[0]?.name ?? null)
                        }
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-hairline px-3.5 py-3 text-sm text-subtle transition hover:border-accent hover:text-ink"
                      >
                        <PaperclipIcon />
                        <span className="truncate">
                          {fileName ?? "Attach a screenshot (optional)"}
                        </span>
                      </button>
                    </div>

                    {status === "error" && error ? (
                      <p className="text-sm text-neg">{error}</p>
                    ) : null}

                    <button
                      type="submit"
                      disabled={status === "sending"}
                      className="mt-1 w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-60"
                    >
                      {status === "sending" ? "Sending…" : "Send report"}
                    </button>
                  </form>
                </>
              )}
            </motion.div>
          </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

function BugIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <path
        d="M10 6.5a3 3 0 013 3v2a3 3 0 01-6 0v-2a3 3 0 013-3zM10 3.5v1.5M6 6l1.2 1.2M14 6l-1.2 1.2M4.5 10H6m8 0h1.5M5 14l1.4-1M15 14l-1.4-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        d="M14.5 9l-4.6 4.6a2.5 2.5 0 01-3.5-3.5l5-5a1.5 1.5 0 012.1 2.1l-5 5a.5.5 0 01-.7-.7l4.6-4.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
