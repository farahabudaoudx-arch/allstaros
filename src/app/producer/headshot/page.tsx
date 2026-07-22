import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { HeadshotUpload } from "@/components/producer/HeadshotUpload";
import { approvedPhotoUrl } from "@/lib/headshots/photo";

export default async function HeadshotPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/sign-in");

  const status = person.photo_review_status;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <h1 className="text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Your headshot</h1>
      <p className="mt-3 max-w-2xl text-mute">
        Every builder and producer uses a real, professional headshot so the leaderboard and team
        pages show real faces. Upload yours below.
      </p>

      {status === "rejected" && person.photo_rejection_reason ? (
        <div className="mt-6 rounded-2xl border border-warn/40 bg-warn/[0.06] p-4">
          <p className="text-sm font-semibold text-warn">Your last photo was not approved</p>
          <p className="mt-1 text-sm text-ink">Reason: {person.photo_rejection_reason}</p>
          <p className="mt-1 text-sm text-mute">Please upload a new one that follows the guidance below.</p>
        </div>
      ) : status === "pending" ? (
        <div className="mt-6 rounded-2xl border border-hairline bg-card p-4">
          <p className="text-sm font-semibold text-ink">Your photo is in review</p>
          <p className="mt-1 text-sm text-mute">
            It is live now and an admin will review it shortly. You can replace it any time below.
          </p>
        </div>
      ) : status === "approved" ? (
        <div className="mt-6 rounded-2xl border border-hairline bg-card p-4">
          <p className="text-sm font-semibold text-ink">Your photo is approved</p>
          <p className="mt-1 text-sm text-mute">Upload a new one below to replace it (it will go back into review).</p>
        </div>
      ) : null}

      <div className="mt-8">
        <HeadshotUpload currentName={person.full_name} currentPhotoUrl={approvedPhotoUrl(person)} />
      </div>
    </main>
  );
}
