"use client";

import { useEffect } from "react";
import { HeadshotUpload } from "@/components/producer/HeadshotUpload";

/**
 * The headshot login wall, shown as a forced popup over the whole app (via
 * producer/layout) to any builder/producer who is behind the wall
 * (isBehindHeadshotWall). It is deliberately un-dismissable: no X, no Escape,
 * no backdrop click. The only way out is to upload a photo, which flips the
 * person to 'pending' so the wall clears on the refresh that HeadshotUpload
 * triggers on success.
 *
 * People who are not behind the wall never render it at all.
 */
export function HeadshotGateModal({
  open,
  currentName,
  rejectionReason,
}: {
  open: boolean;
  currentName: string;
  rejectionReason: string | null;
}) {
  // Lock background scroll while the wall is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm md:p-8">
      {/* The white card owns its own title, intro, and rejection notice. */}
      <div className="my-8 w-full max-w-2xl shadow-2xl">
        <HeadshotUpload
          heading="Add your headshot to continue"
          currentName={currentName}
          currentPhotoUrl={null}
          rejectionReason={rejectionReason}
        />
      </div>
    </div>
  );
}
