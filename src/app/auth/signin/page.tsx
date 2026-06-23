import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEV_LOGIN_ENABLED } from "@/lib/devLogin";
import { HeroVideo } from "@/components/HeroVideo";
import { HERO_VIDEO_URL } from "@/lib/storage-url";
import SignInButton from "./signin-button";

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;
  if (user) redirect(params.next ?? "/");

  return (
    <div className="relative flex min-h-dvh flex-1 items-center justify-center overflow-hidden px-6 py-24">
      {/* Background video — same clip as the landing page hero. */}
      <HeroVideo
        src={HERO_VIDEO_URL}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
      />
      {/* Dark tint so the sign-in card and text stay readable over the video. */}
      <div aria-hidden className="absolute inset-0 z-[1] bg-background/75" />
      <div className="relative z-[2] w-full max-w-md rounded-2xl border border-hairline bg-card p-10">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt="All Star OS"
            width={140}
            height={79}
            priority
            className="mx-auto h-10 w-auto"
          />
          <p className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-mute">
            All Star OS
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
            Sign in to continue
          </h1>
        </div>

        {params.error ? (
          <div className="mb-6 rounded-xl border border-neg/40 bg-neg/[0.08] px-4 py-3 text-sm text-neg">
            Sign-in failed. Try again.
          </div>
        ) : null}

        <SignInButton next={params.next ?? "/"} />

        {DEV_LOGIN_ENABLED ? (
          <p className="mt-4 text-center text-xs text-mute">
            <Link href="/auth/dev" className="underline hover:text-accent">
              Dev sign-in
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
