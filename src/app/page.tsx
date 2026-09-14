import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveLandingPath } from "@/lib/auth";
import { DEV_LOGIN_ENABLED } from "@/lib/devLogin";
import { HeroVideo } from "@/components/HeroVideo";
import { SignInModal } from "@/components/SignInModal";
import { HERO_VIDEO_URL } from "@/lib/storage-url";
import { getInstallationConfig } from "@/lib/installation/config";
import { InstallationBrandProvider } from "@/lib/installation/brand-context";
import { InstallationLogo } from "@/components/InstallationLogo";

export async function generateMetadata(): Promise<Metadata> {
  const installation = await getInstallationConfig();
  return {
    title: `${installation.productName} — Systems designed to turn you into an ${installation.shortName}`,
    description: `The operating system for ${installation.organizationName}. Systems designed to turn you into an ${installation.shortName}.`,
  };
}

function Hero({ shortName }: { shortName: string }) {
  return (
    <section className="relative flex flex-1 flex-col overflow-hidden">
      {/* Background video. Muted + playsInline so it autoplays everywhere,
          incl. iOS — see HeroVideo for the mobile-autoplay handling. */}
      <HeroVideo
        src={HERO_VIDEO_URL}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
      />
      {/* Dark tint so the headline and accent stay readable over the video. */}
      <div aria-hidden className="absolute inset-0 z-[1] bg-background/70" />
      {/* Gold wash behind the headline. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-20%] z-[1] mx-auto h-[480px] max-w-3xl rounded-full bg-accent/[0.10] blur-[120px]"
      />
      <div className="relative z-[2] mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-5 py-20 text-center md:px-10">
        <InstallationLogo className="app-logo h-12 w-auto md:h-16" />
        <h1 className="mt-8 max-w-5xl text-balance text-4xl font-semibold tracking-[-0.03em] md:text-6xl lg:text-7xl">
          Systems Designed To Turn You Into An{" "}
          <span className="italic text-accent">{shortName}</span>
        </h1>
        <div className="mt-10">
          <SignInModal next="/" devLogin={DEV_LOGIN_ENABLED} />
        </div>
      </div>
    </section>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const installation = await getInstallationConfig();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const path = await resolveLandingPath(supabase, user.id);
    redirect(path);
  }

  return (
    <InstallationBrandProvider
      brand={{
        organizationName: installation.organizationName,
        shortName: installation.shortName,
        productName: installation.productName,
        brandPrimaryColor: installation.brandPrimaryColor,
        brandAccentColor: installation.brandAccentColor,
        logoUrl: installation.logoUrl,
        faviconUrl: installation.faviconUrl,
      }}
    >
      <div className="flex flex-1 flex-col">
        <Hero shortName={installation.shortName} />
      </div>
    </InstallationBrandProvider>
  );
}
