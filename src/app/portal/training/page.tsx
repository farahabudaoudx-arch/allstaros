import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { getProgram } from "@/lib/producer/trainings";
import { bunnyTrainingProgram, listBunnyVideos } from "@/lib/bunny";
import { portalFeaturesUnlocked } from "@/lib/portal/access";
import type { Recruit } from "@/lib/db/types";

export default async function PortalTrainingPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/portal/training");
  // Producers and builders train in the producer portal.
  if (person.is_builder || person.is_producer) redirect("/producer");

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("phase, phase_step")
    .eq("person_id", person.id)
    .maybeSingle();
  if (!recruitRow) redirect("/onboarding/pending");
  if (!portalFeaturesUnlocked(recruitRow as Recruit)) redirect("/portal");

  // Pull the real training library from Bunny Stream when it's configured;
  // fall back to the static placeholder catalog if it isn't (or returns empty).
  const videos = await listBunnyVideos();
  const program =
    videos.length > 0 ? bunnyTrainingProgram(videos) : getProgram("launchpad");

  return (
    <div className="flex h-dvh flex-col">
      <div className="min-h-0 flex-1">
        <CoursePlatform program={program} fill="parent" />
      </div>
    </div>
  );
}
