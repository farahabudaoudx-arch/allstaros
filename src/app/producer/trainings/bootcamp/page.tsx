import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { getProgram } from "@/lib/producer/trainings";

export default function BootcampPage() {
  return <CoursePlatform program={getProgram("bootcamp")} />;
}
