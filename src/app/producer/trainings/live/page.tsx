import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { getProgram } from "@/lib/producer/trainings";

export default function PreviousLiveTrainingsPage() {
  return <CoursePlatform program={getProgram("live")} />;
}
