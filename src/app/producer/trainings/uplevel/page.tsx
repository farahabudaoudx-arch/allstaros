import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { getProgram } from "@/lib/producer/trainings";

export default async function UplevelPage() {
  const person = await getCurrentPerson();
  if (!person?.is_builder) redirect("/producer/trainings/bootcamp");
  return <CoursePlatform program={getProgram("uplevel")} />;
}
