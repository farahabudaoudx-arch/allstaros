"use client";

import { motion } from "framer-motion";

export type StepStatus = "complete" | "active" | "locked";

export function Timeline({ children }: { children: React.ReactNode }) {
  return <ol className="relative">{children}</ol>;
}

export function TimelineStep({
  number,
  title,
  description,
  status,
  isLast = false,
  animateUnlock = false,
  children,
}: {
  number?: string;
  title: string;
  description?: string;
  status: StepStatus;
  isLast?: boolean;
  animateUnlock?: boolean;
  children?: React.ReactNode;
}) {
  const locked = status === "locked";

  return (
    <li className="flex gap-5">
      {/* Rail: node + connecting line */}
      <div className="flex flex-col items-center">
        <NodeCircle status={status} />
        {!isLast ? (
          <span
            aria-hidden
            className={`mt-1 w-0.5 flex-1 rounded-full ${
              status === "complete" ? "bg-accent/60" : "bg-hairline"
            }`}
          />
        ) : null}
      </div>

      {/* Card */}
      <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-8"}`}>
        <motion.div
          initial={
            animateUnlock ? { filter: "blur(10px)", opacity: 0.3, y: 8 } : false
          }
          animate={
            animateUnlock
              ? { filter: "blur(0px)", opacity: 1, y: 0 }
              : undefined
          }
          transition={{ duration: 0.65, ease: "easeOut" }}
          aria-hidden={locked || undefined}
          inert={locked || undefined}
          className={`rounded-2xl border bg-card p-6 transition-[filter,opacity] duration-500 ${
            status === "active" ? "border-accent/40" : "border-hairline"
          } ${
            locked ? "pointer-events-none select-none opacity-60 blur-[5px]" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {number ? (
                <span className="text-3xl font-bold tabular-nums text-accent">
                  {number}
                </span>
              ) : null}
              <h2
                className={`text-lg font-semibold tracking-[-0.01em] text-ink ${
                  number ? "mt-2" : ""
                }`}
              >
                {title}
              </h2>
            </div>
            <StatusBadge status={status} />
          </div>

          {description ? (
            <p className="mt-2 text-sm text-subtle">{description}</p>
          ) : null}

          {children ? <div className="mt-5">{children}</div> : null}
        </motion.div>
      </div>
    </li>
  );
}

/**
 * Closing card at the bottom of the timeline — no step number, just a success
 * message. Locked (blurred) until the recruit reaches the end, then it clears.
 * Always the last item, so it never draws a connector line below itself.
 */
export function TimelineFinale({
  status,
  children,
}: {
  status: StepStatus;
  children: React.ReactNode;
}) {
  const locked = status === "locked";

  return (
    <li className="flex gap-5">
      <div className="flex flex-col items-center">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            locked
              ? "border border-hairline bg-card text-mute"
              : "bg-pos text-background"
          }`}
        >
          {locked ? <LockIcon /> : <CheckIcon />}
        </span>
      </div>

      <div className="min-w-0 flex-1 pb-0">
        <div
          aria-hidden={locked || undefined}
          inert={locked || undefined}
          className={`rounded-2xl border p-6 transition-[filter,opacity] duration-500 ${
            locked
              ? "pointer-events-none select-none border-hairline bg-card opacity-60 blur-[5px]"
              : "border-pos/40 bg-pos/[0.06]"
          }`}
        >
          {children}
        </div>
      </div>
    </li>
  );
}

function NodeCircle({ status }: { status: StepStatus }) {
  if (status === "complete") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-background">
        <CheckIcon />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-background">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-card text-mute">
      <LockIcon />
    </span>
  );
}

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === "complete") {
    return (
      <span className="shrink-0 rounded-full bg-pos/[0.12] px-2.5 py-1 text-xs font-medium text-pos">
        Done
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="shrink-0 rounded-full bg-accent/[0.12] px-2.5 py-1 text-xs font-medium text-accent">
        Now
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-hairline px-2.5 py-1 text-xs font-medium text-mute">
      Locked
    </span>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M5 10.5l3.2 3.2L15 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
      <rect
        x="4.5"
        y="9"
        width="11"
        height="7.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M7 9V6.8a3 3 0 016 0V9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
