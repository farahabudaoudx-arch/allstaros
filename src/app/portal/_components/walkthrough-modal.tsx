"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function WalkthroughButton({
  label = "Watch video walkthrough",
  title,
  videoUrl,
  variant = "secondary",
}: {
  label?: string;
  title: string;
  videoUrl: string;
  variant?: Variant;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={buttonClass(variant)}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <VideoModal title={title} videoUrl={videoUrl} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function VideoModal({
  title,
  videoUrl,
  children,
  onClose,
}: {
  title: string;
  videoUrl: string;
  children?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-hairline bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-hairline px-2.5 py-1 text-sm text-subtle transition hover:border-accent hover:text-accent"
          >
            ✕
          </button>
        </div>
        <div className="aspect-video w-full bg-black">
          <iframe
            src={videoUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
        {children ? <div className="px-5 py-4">{children}</div> : null}
      </div>
    </div>
  );
}
