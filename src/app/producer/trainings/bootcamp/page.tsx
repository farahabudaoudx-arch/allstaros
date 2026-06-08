import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { resolveProgram } from "@/lib/producer/training-content";

export default async function BootcampPage() {
  const program = await resolveProgram("bootcamp");
  return <CoursePlatform program={program} />;
}
