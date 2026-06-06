import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { getProgram } from "@/lib/producer/trainings";
import { listBunnyVideos, liveTrainingProgram } from "@/lib/bunny";

export default async function PreviousLiveTrainingsPage() {
  // Pull the live-training library from Bunny Stream when it's configured; fall
  // back to the static placeholder catalog if it isn't (or returns empty).
  const videos = await listBunnyVideos("live");
  const program =
    videos.length > 0 ? liveTrainingProgram(videos) : getProgram("live");

  return <CoursePlatform program={program} />;
}
