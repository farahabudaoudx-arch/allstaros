import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { resolveProgram } from "@/lib/producer/training-content";

export default async function UplevelPage() {
  const person = await getCurrentPerson();
  if (!person?.is_builder) redirect("/producer/trainings/bootcamp");
  const program = await resolveProgram("uplevel");
  return <CoursePlatform program={program} />;
}
