import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { NpnRequestModal } from "./_components/npn-request-modal";
import { HeadshotGateModal } from "./_components/headshot-gate-modal";
import { Os2AnnouncementModal } from "./_components/os2-announcement-modal";
import { isBehindHeadshotWall } from "@/lib/headshots/wall";

/**
 * Thin shell for everything under /producer. Only the auth guard and the two
 * forced-popup modals (NPN, headshot wall) live here — chrome (sidebar vs.
 * bare menu screen) is decided per route group below this layout, since the
 * home menu is a full-bleed screen with no sidebar while every other
 * producer route keeps it (see `(app)/layout.tsx`).
 */
export default async function ProducerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer");
  // Additive roles: builders keep producer access; pure recruits don't.
  if (!person.is_producer && !person.is_builder) redirect("/portal");

  // The two blocking popups come first; the OS 2.0 announcement only renders
  // once there's nothing they're required to deal with, so the popups never stack.
  const blocked = isBehindHeadshotWall(person) || person.npn_status === "missing";

  return (
    <>
      {children}
      {/* Only active producers/builders reach this layout; show the NPN popup to
          those who still have no NPN on file. Answering flips npn_status off
          "missing", so it never returns. */}
      <NpnRequestModal initialOpen={person.npn_status === "missing"} />
      {/* Login wall: a forced popup for any builder/producer who has no photo or
          was rejected. Uploading flips them to 'pending' and clears it. */}
      <HeadshotGateModal
        open={isBehindHeadshotWall(person)}
        currentName={person.full_name}
        rejectionReason={
          person.photo_review_status === "rejected" ? person.photo_rejection_reason : null
        }
      />
      {/* One-time "All Star OS 2.0" walkthrough popup. Dismisses for good on
          "Let's go" (remembered per browser). */}
      {blocked ? null : <Os2AnnouncementModal />}
    </>
  );
}
