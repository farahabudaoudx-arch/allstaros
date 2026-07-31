import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { getProgram } from "@/lib/producer/trainings";
import { listBunnyVideos, liveTrainingProgram } from "@/lib/bunny";
import {
  getLibraryContent,
  programFromDbRows,
} from "@/lib/producer/training-content";

export default async function PreviousLiveTrainingsPage() {
  // Prefer admin-curated rows (training_content 'live'); otherwise pull the
  // Bunny live library; otherwise the static placeholder catalog.
  const dbRows = await getLibraryContent("live");
  if (dbRows.length > 0) {
    return (
      <CoursePlatform program={programFromDbRows("live", dbRows)} fill="parent" backHref="/producer/menu/training" />
    );
  }

  const videos = await listBunnyVideos("live");
  const program =
    videos.length > 0 ? liveTrainingProgram(videos) : getProgram("live");
  return <CoursePlatform program={program} fill="parent" backHref="/producer/menu/training" />;
}
