import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { getProgram } from "@/lib/producer/trainings";
import { bunnyTrainingProgram } from "@/lib/bunny";
import { getLibraryContent, programFromDbRows } from "@/lib/producer/training-content";
import { listInstallationVideos } from "@/lib/services/video/registry";
import { getInstallationBrand } from "@/lib/installation/config";
import { portalFeaturesUnlocked } from "@/lib/portal/access";
import type { Recruit } from "@/lib/db/types";

export default async function PortalTrainingPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/portal/training");
  // Producers and builders train in the producer portal.
  if (person.is_builder || person.is_producer) redirect("/producer");

  const supabase = await createClient();
  const brand = await getInstallationBrand();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("phase, phase_step")
    .eq("person_id", person.id)
    .maybeSingle();
  if (!recruitRow) redirect("/onboarding/pending");
  if (!portalFeaturesUnlocked(recruitRow as Recruit)) redirect("/portal");

  const dbRows = await getLibraryContent("recruit");
  const videoResult = dbRows.length > 0 ? null : await listInstallationVideos();
  const videos = videoResult?.status === "ready" ? videoResult.data : [];
  const program = dbRows.length > 0
      ? programFromDbRows("launchpad", dbRows)
      : videos.length > 0
      ? bunnyTrainingProgram(videos, `${brand.shortName} Training`)
      : { ...getProgram("launchpad"), courses: [] };

  return (
    <div className="flex h-dvh flex-col">
      <div className="min-h-0 flex-1">
        <CoursePlatform program={program} fill="parent" />
        {program.courses.length === 0 && videoResult && videoResult.status !== "ready" ? (
          <p className="mx-auto max-w-xl px-6 pb-8 text-center text-sm text-subtle">
            {videoResult.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
