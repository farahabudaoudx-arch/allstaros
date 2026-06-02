"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { VideoModal } from "./walkthrough-modal";

// Placeholder — swap for the real encouragement video.
const FAIL_VIDEO_URL = "https://www.youtube.com/embed/dQw4w9WgXcQ";

export function ExamFailModal({ open }: { open: boolean }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (!open || dismissed) return null;

  function close() {
    setDismissed(true);
    // Strip ?failed=1 so it doesn't pop again on refresh.
    router.replace("/portal");
  }

  return (
    <VideoModal title="It's okay — you've got this" videoUrl={FAIL_VIDEO_URL} onClose={close}>
      <div className="space-y-3 text-sm text-subtle">
        <p>
          Failing the first time is normal. Here&apos;s what matters: recruits who
          go back and take it again pass{" "}
          <span className="font-semibold text-ink">90% of the time</span>.
        </p>
        <p>
          Reschedule your exam date in step 1, keep studying, and come back to mark
          it passed once you retake it. You&apos;re still in the program.
        </p>
        <button
          type="button"
          onClick={close}
          className="mt-2 inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-sm font-medium text-black transition hover:bg-accent-soft"
        >
          Got it — let&apos;s reschedule
        </button>
      </div>
    </VideoModal>
  );
}
