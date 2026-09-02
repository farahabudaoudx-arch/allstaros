import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function PendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  // A linked person who already has a home must not sit on this holding
  // screen. Pure admins were bouncing here (no recruit row) and had no way out.
  const person = await getCurrentPerson();
  if (person?.is_builder || person?.is_producer) redirect("/producer");
  if (person?.is_admin || person?.is_super_admin) redirect("/admin");

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-lg rounded-2xl border border-hairline bg-card p-10 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-mute">
          Waiting on your upline
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
          Your account isn’t linked yet
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Your builder will mark your interview as passed and your portal will
          appear here. Refresh after they confirm.
        </p>
        <form action="/auth/signout" method="post" className="mt-8">
          <button
            type="submit"
            className="text-sm font-medium text-accent transition hover:text-accent-soft"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
