import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveLandingPath } from "@/lib/auth";
import { LinkButton } from "@/components/ui";

export const metadata = {
  title: "All Star OS — Systems designed to turn you into an All Star",
  description:
    "The operating system for All Star Life Group. Systems designed to turn you into an All Star.",
};

function Hero() {
  return (
    <section className="relative flex flex-1 flex-col overflow-hidden">
      {/* Background video. Muted + playsInline so it autoplays everywhere. */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
      >
        <source
          src="https://atgqjhfbhaptpendzddl.supabase.co/storage/v1/object/public/homepage/all%20star%20login%20page%201.mp4"
          type="video/mp4"
        />
      </video>
      {/* Dark tint so the headline and accent stay readable over the video. */}
      <div aria-hidden className="absolute inset-0 z-[1] bg-background/70" />
      {/* Gold wash behind the headline. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-20%] z-[1] mx-auto h-[480px] max-w-3xl rounded-full bg-accent/[0.10] blur-[120px]"
      />
      <div className="relative z-[2] mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-5 py-20 text-center md:px-10">
        <Image
          src="/logo.png"
          alt="All Star Life Group"
          width={220}
          height={124}
          priority
          className="app-logo h-12 w-auto md:h-16"
        />
        <h1 className="mt-8 max-w-5xl text-balance text-4xl font-semibold tracking-[-0.03em] md:text-6xl lg:text-7xl">
          Systems Designed To Turn You Into An{" "}
          <span className="italic text-accent">All Star</span>
        </h1>
        <div className="mt-10">
          <LinkButton
            href="/auth/signin"
            variant="primary"
            className="px-7 py-3 text-base"
          >
            Sign In
          </LinkButton>
        </div>
      </div>
    </section>
  );
}

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
    <div className="flex flex-1 flex-col">
      <Hero />
    </div>
  );
}
