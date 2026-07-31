import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { HeadshotUpload } from "@/components/producer/HeadshotUpload";
import { BackHomeNav } from "@/components/producer/BackHomeNav";
import { approvedPhotoUrl } from "@/lib/headshots/photo";

export default async function HeadshotPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/sign-in");

  const rejectionReason =
    person.photo_review_status === "rejected" ? person.photo_rejection_reason : null;

  return (
    <main className="flex-1 px-5 py-10 md:px-10 md:py-14">
      {/* Nav sits on the page, not inside the upload card: that card is forced
          white in both themes, so the themed Back/Home pair would be unreadable
          against it in dark mode. */}
      <div className="mb-8 flex justify-center">
        <BackHomeNav fallbackHref="/producer" />
      </div>
      <HeadshotUpload
        heading="Your headshot"
        currentName={person.full_name}
        currentPhotoUrl={approvedPhotoUrl(person)}
        rejectionReason={rejectionReason}
        centered
      />
    </main>
  );
}
