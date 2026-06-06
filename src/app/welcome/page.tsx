import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetupForm } from "./SetupForm";

/**
 * Account setup — where an invited recruit lands after clicking their invite
 * link. The link already signed them in via /auth/callback, so we just need a
 * user here. They fill in their name, phone, state, and a password.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?next=/welcome");

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-card p-10">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt="All Star OS"
            width={140}
            height={79}
            priority
            className="mx-auto h-10 w-auto"
          />
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">
            Set up your account
          </h1>
          <p className="mt-3 text-sm text-subtle">
            A few details and a password, and you’re in.
          </p>
        </div>

        <SetupForm />
      </div>
    </div>
  );
}
