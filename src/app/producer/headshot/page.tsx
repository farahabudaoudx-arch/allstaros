import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { HeadshotUpload } from "@/components/producer/HeadshotUpload";
import { approvedPhotoUrl } from "@/lib/headshots/photo";

export default async function HeadshotPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/sign-in");

  const rejectionReason =
    person.photo_review_status === "rejected" ? person.photo_rejection_reason : null;

  return (
    <main className="flex-1 px-5 py-10 md:px-10 md:py-14">
      <HeadshotUpload
        heading="Your headshot"
        currentName={person.full_name}
        currentPhotoUrl={approvedPhotoUrl(person)}
        rejectionReason={rejectionReason}
      />
    </main>
  );
}
