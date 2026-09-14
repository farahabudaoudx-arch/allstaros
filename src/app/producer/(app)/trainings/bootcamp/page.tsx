import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { resolveProgram } from "@/lib/producer/training-content";

/**
 * Bootcamp is locked. The menu tile is greyed out (see /producer/menu/training),
 * and this page stays as the landing spot for anyone arriving from an old link
 * or bookmark, so they get "coming soon" rather than a half-built program.
 */
export default async function BootcampPage() {
  const program = await resolveProgram("bootcamp");
  return <CoursePlatform program={program} fill="parent" backHref="/producer/menu/training" />;
}
