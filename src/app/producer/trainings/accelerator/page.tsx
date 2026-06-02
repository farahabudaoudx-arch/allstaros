import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { getProgram } from "@/lib/producer/trainings";

export default function AcceleratorPage() {
  return <CoursePlatform program={getProgram("accelerator")} />;
}
