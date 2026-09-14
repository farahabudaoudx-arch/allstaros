import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { PageHeader } from "@/components/producer/PageHeader";
import { getProgram } from "@/lib/producer/trainings";
import { liveTrainingProgram } from "@/lib/bunny";
import { listInstallationVideos } from "@/lib/services/video/registry";
import {
  getLibraryContent,
  programFromDbRows,
} from "@/lib/producer/training-content";

export default async function PreviousLiveTrainingsPage() {
  // Prefer admin-curated rows (training_content 'live'); otherwise pull the
  // Bunny live library.
  const dbRows = await getLibraryContent("live");
  if (dbRows.length > 0) {
    return (
      <CoursePlatform
        program={programFromDbRows("live", dbRows)}
        fill="parent"
        backHref="/producer"
      />
    );
  }

  const videoResult = await listInstallationVideos("live");
  const videos = videoResult.status === "ready" ? videoResult.data : [];
  if (videos.length > 0) {
    return (
      <CoursePlatform
        program={liveTrainingProgram(videos)}
        fill="parent"
        backHref="/producer"
      />
    );
  }

  // No placeholder catalog. This page used to fall back to a hardcoded list of
  // invented recordings ("May team call: Q2 push & mindset reset"), which looks
  // like a working library until you click one. An empty page that says it's
  // empty is the honest answer, and it makes a missing library key obvious
  // instead of hiding it behind convincing-looking fake rows.
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <PageHeader title={getProgram("live").title} />
      <div className="rounded-2xl border border-hairline bg-card p-12 text-center">
        <p className="text-xl font-semibold tracking-[-0.02em] text-ink">
          Nothing here yet
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-subtle">
          {videoResult.status === "ready"
            ? "Recordings of past live trainings will show up here once they're posted."
            : videoResult.message}
        </p>
      </div>
    </main>
  );
}
