import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveLandingPath } from "@/lib/auth";
import { LinkButton } from "@/components/ui";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const path = await resolveLandingPath(supabase, user.id);
    redirect(path);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20">
      <main className="w-full max-w-2xl text-center">
        <Link href="/" className="inline-flex">
          <Image
            src="/logo.png"
            alt="All Star OS"
            width={160}
            height={90}
            priority
            className="mx-auto h-12 w-auto"
          />
        </Link>
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.18em] text-mute">
          All Star OS
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.025em] md:text-6xl">
          The recruiting pipeline,{" "}
          <span className="italic text-accent">end to end.</span>
        </h1>
        <p className="mt-5 text-base leading-7 text-subtle">
          Carry a recruit from a passed interview through licensing, onboarding,
          and a 28-day bootcamp. Catch the ones who stall before they slip.
        </p>
        <div className="mt-10 flex justify-center">
          <LinkButton href="/auth/signin" variant="primary" className="px-6 py-3">
            Sign in
          </LinkButton>
        </div>
      </main>
    </div>
  );
}
