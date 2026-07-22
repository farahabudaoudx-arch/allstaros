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
      <div className="my-auto w-full max-w-4xl rounded-3xl border border-hairline bg-card-hi p-6 shadow-2xl md:p-8">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
          Add your headshot to continue
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-mute">
          Every builder and producer uses a real, professional headshot so the leaderboard and team
          pages show real faces. Upload yours to get into the app. It goes live for review right
          away, and your circle shows your initials until an admin approves it.
        </p>

        {rejectionReason ? (
          <div className="mt-4 rounded-2xl border border-warn/40 bg-warn/[0.06] p-4">
            <p className="text-sm font-semibold text-warn">Your last photo was not approved</p>
            <p className="mt-1 text-sm text-ink">Reason: {rejectionReason}</p>
            <p className="mt-1 text-sm text-mute">Please upload a new one that follows the guidance below.</p>
          </div>
        ) : null}

        <div className="mt-6">
          {/* No current photo passed: behind the wall means nothing approved to show. */}
          <HeadshotUpload currentName={currentName} currentPhotoUrl={null} />
        </div>
      </div>
    </div>
  );
}
