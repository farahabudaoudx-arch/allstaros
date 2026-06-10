import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { resolveProgram } from "@/lib/producer/training-content";

export default async function AcceleratorPage() {
  const program = await resolveProgram("accelerator");
  return <CoursePlatform program={program} />;
}
