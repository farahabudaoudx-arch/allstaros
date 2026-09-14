import { redirect } from "next/navigation";
import { canAccessProducerApp, getCurrentPerson } from "@/lib/auth";
import { NpnRequestModal } from "./_components/npn-request-modal";
import { HeadshotGateModal } from "./_components/headshot-gate-modal";
import { isBehindHeadshotWall } from "@/lib/headshots/wall";
import { getInstallationBrand } from "@/lib/installation/config";
import { InstallationBrandProvider } from "@/lib/installation/brand-context";

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
  // Admins may open producer routes to preview generated Scorecards.
  if (!canAccessProducerApp(person)) redirect("/portal");
  const brand = await getInstallationBrand();

  return (
    <InstallationBrandProvider brand={brand}>
      {children}
      {/* Show the NPN popup to producers/builders who still have no NPN on file.
          Admins previewing Scorecards skip it. Answering flips npn_status off
          "missing", so it never returns. */}
      <NpnRequestModal
        initialOpen={
          (person.is_producer || person.is_builder) && person.npn_status === "missing"
        }
      />
      {/* Login wall: a forced popup for any builder/producer who has no photo or
          was rejected. Uploading flips them to 'pending' and clears it. */}
      <HeadshotGateModal
        open={isBehindHeadshotWall(person)}
        currentName={person.full_name}
        rejectionReason={
          person.photo_review_status === "rejected" ? person.photo_rejection_reason : null
        }
      />
    </InstallationBrandProvider>
  );
}
