import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PortalShell, { PortalHeading } from "../_components/portal-shell";
import { portalFeaturesUnlocked } from "@/lib/portal/access";
import { AllStarChat } from "@/components/AllStarChat";
import type { Recruit } from "@/lib/db/types";
import { getInstallationBrand } from "@/lib/installation/config";

export default async function PortalHelpPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/portal/help");
  if (person.is_builder) redirect("/producer");
  if (person.is_producer) redirect("/producer");

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitRow as Recruit | null;
  if (!recruit) redirect("/onboarding/pending");
  if (!portalFeaturesUnlocked(recruit)) redirect("/portal");
  const brand = await getInstallationBrand();

  // Same AI as the builder platform's Resources → All Star Sidekick: the
  // RAG-backed AllStarChat component (hits /api/allstar-ai → askCoach over the
  // training library), not the old phase-navigation form assistant.
  return (
    <PortalShell
      heading={
        <PortalHeading
          eyebrow="Included standard AI coach"
          title={`${brand.shortName} Sidekick`}
          subtitle="Sales, scripts, objections, products, licensing, and more. Customer-uploaded training is only used when a separately configured custom coach is enabled. Need a human? Message your builder from the Messages tab."
        />
      }
    >
      <AllStarChat />
    </PortalShell>
  );
}
